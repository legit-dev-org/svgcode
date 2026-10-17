import type { Point } from "./Point.ts";
import { SvgPathParser } from "./SvgPathParser.ts";
import { XMLNode } from "./XMLParser.ts";

export interface IGcodePathRootConfig {
    name: string;
    z?: number;
    iterationsPerMM?: number;
    linearTolerance?: number;
    curveApproximations?: number;
}

export interface IGcodePathParserConfig {
    pathRoots: Array<IGcodePathRootConfig>;
    safeZ: number;
    z: number;
    iterationsPerMM: number;
    curveApproximations: number;
    linearTolerance: number;
    documentHeight: number;
}

interface IGcodePathRoot extends IGcodePathRootConfig {
    node: XMLNode;
};

interface IGcodePath {
    parser: SvgPathParser;
    iterationsPerMM: number;
    linearTolerance: number;
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
                        linearTolerance: root.linearTolerance,
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
                        linearTolerance: rootNode.linearTolerance ?? config.linearTolerance,
                        iterationsPerMM: rootNode.iterationsPerMM ?? config.iterationsPerMM,
                        z: rootNode.z ?? config.z,
                    });
                } else {
                    console.warn(`No parser for type '${n.name}'`);
                }
            });
        }

        paths.reverse();
        gcode.push(`G01 Z${config.safeZ}`);

        const getY = (y: number) => {
            return config.documentHeight - y;
        };

        // draw each path
        for (const path of paths) {
            const iterationPerMM = path.iterationsPerMM;
            const shapes = path.parser.getShapes();
            for (let i = 0; i < shapes.length; i++) {
                const shape = shapes[i];
                const iterations = iterationPerMM * shape.totalLength;
                const iterationAmount = 1.0 / (iterations - 1);

                const pathPoints = new Array<Point>();
                for (let i = 0; i < iterations; i++) {
                    pathPoints.push(shape.getPointForPath(Math.min(1, i * iterationAmount)));
                }

                // reduce pathPoints for linear progress - if 3 path points are "linear enough" get rid of middle one
                let r = 0;
                while (r < pathPoints.length) {
                    if (r + 2 >= pathPoints.length) {
                        break;
                    }
                    const left = pathPoints[r];
                    const middle = pathPoints[r + 1];
                    const right = pathPoints[r + 2];

                    if (this.isMiddlePointRedundant(left, middle, right, path.linearTolerance)) {
                        pathPoints.splice(r + 1, 1);
                        // do not increment i, allow it to continue reducing from left
                    } else {
                        r++;
                    }
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

    private static isMiddlePointRedundant(p1: Point, p2: Point, p3: Point, epsilon: number): boolean {
        const [x1, y1] = [p1.x, p1.y];
        const [x2, y2] = [p2.x, p2.y];
        const [x3, y3] = [p3.x, p3.y];

        const crossProduct = (x2 - x1) * (y3 - y1) - (y2 - y1) * (x3 - x1);
        if (Math.abs(crossProduct) > epsilon) {
            return false; // Not on the same line
        }

        const onX = Math.min(x1, x3) - epsilon <= x2 && x2 <= Math.max(x1, x3) + epsilon;
        const onY = Math.min(y1, y3) - epsilon <= y2 && y2 <= Math.max(y1, y3) + epsilon;
        
        return onX && onY;
    }
}
