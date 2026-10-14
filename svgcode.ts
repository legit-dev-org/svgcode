import fs from "fs";
import path from "path";
import { parseXML } from "./src/XMLParser.ts";
import { GcodeDrillParser } from "./src/GcodeDrillParser.ts";
import type { IGcodeDrillRootConfig } from "./src/GcodeDrillParser.ts";

import { fileURLToPath } from "url";
import { GcodePathParser, type IGcodePathRootConfig } from "./src/GcodePathParser.ts";
import { configDefaults, configJsonDetails } from "./svgcode-syntax.ts";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const configFile = process.argv[2];

const printUsage = (error: unknown) => {
    console.log("Usage:\n    node yarn-cnc.ts <cfg path>");
    console.log("\n");
    console.log("Config Syntax:\n");
    console.log(JSON.stringify(configJsonDetails, undefined, 4));
    console.error(error);
};

if (!configFile) {
    printUsage(new Error("Missing 'cfg'!"));
    process.exit(1);
}

const cfgFilePath = path.resolve(__dirname, configFile);

if (!fs.existsSync(cfgFilePath)) {
    printUsage(new Error(`Cannot find cfg file '${configFile}'`));
    process.exit(1);
}

const getConfigNumber = (cfgValue: unknown): number => {
    if (typeof cfgValue === "number") {
        return cfgValue;
    }
    if (typeof cfgValue === "string") {
        return parseFloat(cfgValue);
    }
    throw new Error(`Unexpcted type of config number value '${typeof cfgValue}'`);
}

let cfgRaw = JSON.parse(fs.readFileSync(cfgFilePath).toString());

const results = new Array<string>();
const cfgs = [];
if (Array.isArray(cfgRaw)) {
    cfgs.push(...cfgRaw);
} else {
    cfgs.push(cfgRaw);
}

for (const cfg of cfgs) {
    let safeZ = configDefaults._safeZ;
    let drillZ = configDefaults._drillZ;
    let pathZ = configDefaults._pathZ;
    let pathCurveApproximations = configDefaults._pathCurveApproximations;
    let pathIterationsPerMM = configDefaults._pathIterationsPerMM;
    let drillCombineDistance = configDefaults._drillCombineDistance;
    let pathLinearTolerance = configDefaults._pathLinearTolerance;
    let slowSpeed = configDefaults._slowSpeed;
    let fastSpeed = configDefaults._fastSpeed;

    if (cfg.safeZ !== undefined) {
        safeZ = getConfigNumber(cfg.safeZ);
    }
    if (cfg.drillZ !== undefined) {
        drillZ = getConfigNumber(cfg.drillZ);
    }
    if (cfg.pathZ !== undefined) {
        pathZ = getConfigNumber(cfg.pathZ);
    }
    if (cfg.pathCurveApproximations !== undefined) {
        pathCurveApproximations = getConfigNumber(cfg.pathCurveApproximations);
    }
    if (cfg.pathIterationsPerMM !== undefined) {
        pathIterationsPerMM = getConfigNumber(cfg.pathIterationsPerMM);
    }
    if (cfg.pathLinearTolerance !== undefined) {
        pathLinearTolerance = getConfigNumber(cfg.pathLinearTolerance);
    }
    if (cfg.drillCombineDistance !== undefined) {
        drillCombineDistance = getConfigNumber(cfg.drillCombineDistance);
    }
    if (cfg.slowSpeed !== undefined) {
        slowSpeed = getConfigNumber(cfg.slowSpeed);
    }
    if (cfg.fastSpeed !== undefined) {
        fastSpeed = getConfigNumber(cfg.fastSpeed);
    }
    if (cfg.input === undefined){
        printUsage(Error("Missing input svg!"));
        process.exit(1);
    }

    const svgFilePath = path.resolve(path.dirname(cfgFilePath), cfg.input);
    if (!fs.existsSync(svgFilePath)) {
        printUsage(new Error(`Cannot find svg file '${cfg.input}'`));
        process.exit(1);
    }
    const svg = fs.readFileSync(svgFilePath, "utf-8");

    let drillRoots = new Array<IGcodeDrillRootConfig>();
    if (cfg.drillRoots !== undefined) {
        drillRoots = cfg.drillRoots.map((p: IGcodeDrillRootConfig) => {
            const cfg: IGcodeDrillRootConfig = {
                name: p.name,
                z: p.z === undefined ? undefined : getConfigNumber(p.z),
            };
            return cfg;
        });
    }

    let pathRoots = new Array<IGcodePathRootConfig>();
    if (cfg.pathRoots !== undefined) {
        pathRoots = cfg.pathRoots.map((p: IGcodePathRootConfig) => {
            const cfg: IGcodePathRootConfig = {
                name: p.name,
                iterationsPerMM: p.iterationsPerMM === undefined ? undefined : getConfigNumber(p.iterationsPerMM),
                linearTolerance: p.linearTolerance === undefined ? undefined : getConfigNumber(p.linearTolerance),
                curveApproximations: p.curveApproximations === undefined ? undefined : getConfigNumber(p.curveApproximations),
                z: p.z === undefined ? undefined : getConfigNumber(p.z),
            };
            return cfg;
        });
    }

    // start gcode generation with some basic starting points
    let gcode = [];
    gcode.push(`G90`);
    gcode.push(`G21`);
    gcode.push(`G00 F${fastSpeed}`);
    gcode.push(`G01 F${slowSpeed}`);
    gcode.push(`G00 X0 Y0 Z${safeZ}`);

    const parsedSvg = parseXML(svg);
    for (const svg of parsedSvg) {
        if (svg.name !== "svg") {
            continue;
        }

        let viewBox;
        for (const attrKey of Object.keys(svg.attributes)) {
            if (attrKey === "viewBox") {
                viewBox = svg.attributes[attrKey];
                break;
            }
        }

        if (viewBox === undefined) {
            throw new Error("Missing viewBox attribute in SVG node within SVG");
        }

        const viewboxParts = viewBox.split(" ");
        if (viewboxParts.length !== 4) {
            throw new Error("Error in SVG: missing viewBox params");
        }

        const documentHeight = parseFloat(viewboxParts[3]) - parseFloat(viewboxParts[1]);
        if (!Number.isFinite(documentHeight)) {
            throw new Error(`Error in SVG: missing height ${viewboxParts[3]},  ${viewboxParts[1]} from '${viewBox}'`);
        }

        gcode.push(...GcodeDrillParser.getDrillCommands(svg, {
            z: drillZ,
            combineDistance: drillCombineDistance,
            drillRoots,
            safeZ,
            documentHeight,
        }));

        gcode.push(...GcodePathParser.getPathCommands(svg, {
            curveApproximations: pathCurveApproximations,
            iterationsPerMM: pathIterationsPerMM,
            linearTolerance: pathLinearTolerance,
            z: pathZ,
            pathRoots,
            safeZ,
            documentHeight,
        }));
    }

    if (cfg.output !== undefined) {
        const writePath = path.resolve(path.dirname(cfgFilePath), cfg.output);
        fs.writeFileSync(writePath, gcode.join("\n"));
        results.push(`Success! Results stored in '${writePath}'`);
    } else {
        console.log(gcode.join("\n"));
        results.push(`Success! Results written to console.`);
    }
}

console.log(results.join("\n"));
