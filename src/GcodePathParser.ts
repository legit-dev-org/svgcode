import type { Point } from "./Point.ts";
import { SvgPathParser } from "./SvgPathParser.ts";
import { XMLNode } from "./XMLParser.ts";

export interface IGcodePathRootConfig {
    name: string;
    z?: number;
    iterationsPerMM?: number;
    curveApproximations?: number;
}

export interface IGcodePathParserConfig {
    pathRoots: Array<IGcodePathRootConfig>;
    safeZ: number;
    z: number;
    iterationsPerMM: number;
    curveApproximations: number;
    documentHeight: number;
}

interface IGcodePathRoot extends IGcodePathRootConfig {
    node: XMLNode;
};

interface IGcodePath {
    parser: SvgPathParser;
    iterationsPerMM?: number;
    source: string;
    z: number;
}

export class GcodePathParser {
    public static getPathCommands(svg: XMLNode, config: IGcodePathParserConfig): Array<string> {
        const gcode = new Array<string>();
        const nodesToProcess = new Array<IGcodePathRoot>;
        for (let i = 0; i < config.pathRoots.length; i++) {
            const root = config.pathRoots[i];
            svg.walkChildrenRecursive((n) => {
                const id = n.attributes["id"];
                const label = n.attributes["label"];
                if (id === root.name || label === root.name) {
                    nodesToProcess.push({
                        node: n,
                        name: root.name,
                        z: root.z,
                        iterationsPerMM: root.iterationsPerMM,
                    });
                    return false;
                }
            });
        }

        const paths = new Array<IGcodePath>();
        for (const rootNode of nodesToProcess) {
            rootNode.node.walkChildrenRecursive((n) => {
                if (n.name === "path") {
                    const parser = new SvgPathParser(n, rootNode.curveApproximations ?? config.curveApproximations);
                    paths.push({
                        parser,
                        source: n.attributes["id"],
                        iterationsPerMM: rootNode.iterationsPerMM ?? config.iterationsPerMM,
                        z: rootNode.z ?? config.z,
                    });
                } else {
                    console.warn(`No parser for type '${n.name}'`);
                }
            });
        }

        gcode.push(`G01 Z${config.safeZ}`);

        const getY = (y: number) => {
            return config.documentHeight - y;
        };

        // draw each path
        for (const path of paths) {
            const iterationPerMM = path.iterationsPerMM ?? config.iterationsPerMM;
            const shapes = path.parser.getShapes();
            for (let i = 0; i < shapes.length; i++) {
                const shape = shapes[i];
                const iterations = iterationPerMM * shape.totalLength;
                const iterationAmount = 1.0 / (iterations - 1);

                const pathPoints = new Array<Point>();
                for (let i = 0; i < iterations; i++) {
                    pathPoints.push(shape.getPointForPath(Math.min(1, i * iterationAmount)));
                }
            
                if (pathPoints.length > 0) {
                    gcode.push(`G00 X${pathPoints[0].x} Y${getY(pathPoints[0].y)} Z${config.safeZ}`);
                    gcode.push(`G01 Z${path.z}`);
                    for (let i = 1; i < pathPoints.length; i++) {
                        const p = pathPoints[i];
                        gcode.push(`G01 X${p.x} Y${getY(p.y)}`);
                    }
                    gcode.push(`G01 Z${config.safeZ}`);
                }
            }
        }

        gcode.push(`G01 Z${config.safeZ}`);
        gcode.push(`G00 X0 Y0 Z${config.safeZ}`);
        return gcode;
    }
}