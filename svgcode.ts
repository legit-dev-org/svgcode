import fs from "fs";
import path from "path";
import { parseXML } from "./src/XMLParser.ts";
import { GcodeDrillParser } from "./src/GcodeDrillParser.ts";
import type { IGcodeDrillRootConfig } from "./src/GcodeDrillParser.ts";

import { fileURLToPath } from "url";
import { GcodePathParser, type IGcodePathRootConfig } from "./src/GcodePathParser.ts";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const configFile = process.argv[2];

const _safeZ = 10;
const _slowSpeed = 1000;
const _fastSpeed = 2000;
const _drillZ = 0;
const _drillCombineDistance = 1;
const _pathZ = 0;
const _pathIterations = 100;
const _pathCurveApproximations = 100;

const configJsonDetails = {
    input: {
        required: true,
        description: "SVG input file location",
    },
    output: {
        description: "SVG output file location",
    },
    safeZ: {
        default: `${_safeZ}mm`,
        description: "Z distance from '0' to set the tool head when moving",
    },
    slowSpeed: {
        default: `${_slowSpeed}mmps`,
        description: "Speed to move the tool head when moving slow (G01)",
    },
    fastSpeed: {
        default: `${_fastSpeed}mmps`,
        description: "Speed to move the tool head when moving fast (G00)",
    },
    drillZ: {
        default: `${_drillZ}mm`,
        description: "Z distance from '0' when drilling holes, unless specified by drillRoots items",
    },
    drillCombineDistance: {
        default: `${_drillCombineDistance}mm`,
        description: "Threshold between two points which will consider holes the same and combine them",
    },
    drillRoots: {
        default: "[...elements]",
        description: "named nodes that are used as roots for hole drilling",
        elements: {
            name: {
                required: true,
                description: "Element name of the root object that contains circle/line segments",
            },
            z: {
                description: "Z distance from '0' when drilling holes",
            },
        },
    },
    pathZ: {
        default: `${_pathZ}mm`,
        description: "Z distance from '0' when carving paths, unless specified by pathRoots items",
    },
    pathIterations: {
        default: `${_pathIterations}`,
        description: "Iterations of the path as movement operations, unless specified by pathRoots items",
    },
    pathCurveApproximations: {
        default: `${_pathCurveApproximations}`,
        description: "Number of approximations used on path curves",
    },
    pathRoots: {
        default: "[...elements]",
        description: "named nodes that are used as roots for path carving",
        elements: {
            name: {
                required: true,
                description: "Element name of the root object that contains line segments",
            },
            z: {
                description: "Z distance from '0' when carving paths",
            },
            iterationsPerPath: {
                description: "Iterations of the path as movement operations"
            },
            curveApproximations: {
                description: "Number of approximations used on path curves",
            }
        },
    }
};

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
    let safeZ = _safeZ;
    let drillZ = _drillZ;
    let pathZ = _pathZ;
    let pathCurveApproximations = _pathCurveApproximations;
    let pathIterations = _pathIterations;
    let drillCombineDistance = _drillCombineDistance;
    let slowSpeed = _slowSpeed;
    let fastSpeed = _fastSpeed;

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
    if (cfg.pathIterations !== undefined) {
        pathIterations = getConfigNumber(cfg.pathIterations);
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
                iterationsPerPath: p.iterationsPerPath === undefined ? undefined : getConfigNumber(p.iterationsPerPath),
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
            iterationsPerPath: pathIterations,
            z: pathZ,
            pathRoots,
            safeZ,
            documentHeight,
        }))
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
