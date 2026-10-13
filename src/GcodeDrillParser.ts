import type { Point } from "./Point.ts";
import { SvgCircleParser } from "./SvgCircleParser.ts";
import { SvgPathParser } from "./SvgPathParser.ts";
import { XMLNode } from "./XMLParser.ts";

export interface IGcodeDrillRootConfig {
    name: string,
    z?: number,
}

export interface IGcodeDrillParserConfig {
    drillRoots: Array<IGcodeDrillRootConfig>;
    safeZ: number;
    z: number;
    combineDistance: number;
    documentHeight: number;
}

interface IGcodeDrillRoot extends IGcodeDrillRootConfig {
    node: XMLNode,
    order: number,
};

interface IGcodeDrillPoint extends Point {
    z: number;
    order: number;
}

export class GcodeDrillParser {
    public static getDrillCommands(svg: XMLNode, config: IGcodeDrillParserConfig): Array<string> {
        const gcode = new Array<string>();
        const nodesToProcess = new Array<IGcodeDrillRoot>;
        for (let i = 0; i < config.drillRoots.length; i++) {
            const root = config.drillRoots[i];
            svg.walkChildrenRecursive((n) => {
                const id = n.attributes["id"];
                const label = n.attributes["label"];
                if (id === root.name || label === root.name) {
                    nodesToProcess.push({
                        node: n,
                        order: i,
                        name: root.name,
                        z: root.z,
                    });
                    return false;
                }
            });
        }

        const drillPointsRaw = new Array<IGcodeDrillPoint>();
        for (const rootNode of nodesToProcess) {
            const z = rootNode.z ?? config.z;
            rootNode.node.walkChildrenRecursive((n) => {
                if (n.name === "path") {
                    const parser = new SvgPathParser(n, 20);
                    const start = parser.getPointForPath(0);
                    const end = parser.getPointForPath(1);
                    drillPointsRaw.push({ x: start.x, y: config.documentHeight - start.y, z: z, order: rootNode.order });
                    drillPointsRaw.push({ x: end.x, y: config.documentHeight - end.y, z: z, order: rootNode.order });
                } else if (n.name === "circle") {
                    const p = SvgCircleParser.getOrigin(n);
                    drillPointsRaw.push({ x: p.x, y: config.documentHeight - p.y, z: z, order: rootNode.order });
                } else {
                    console.warn(`No parser for type '${n.name}'`);
                }
            });
        }

        const distanceBetween = (a: Point, b: Point) => {
            return Math.sqrt(Math.pow(Math.abs(a.x - b.x), 2) + Math.pow(Math.abs(a.y - b.y), 2));
        };

        // de-dupe drill holes
        const drillPoints = new Array<IGcodeDrillPoint>();
        while (drillPointsRaw.length > 0) {
            const point = drillPointsRaw[0];
            drillPointsRaw.sort((a, b) => {
                return distanceBetween(point, a) - distanceBetween(point, b);
            });

            if (drillPointsRaw[0] && drillPointsRaw[1]) {
                while (drillPointsRaw[0] && drillPointsRaw[1] && distanceBetween(drillPointsRaw[0], drillPointsRaw[1]) <= config.combineDistance) {
                    const keep = drillPointsRaw[0].order < drillPointsRaw[1].order ? drillPointsRaw[0] : drillPointsRaw[1];
                    const distance = distanceBetween(drillPointsRaw[0], drillPointsRaw[1])
                    if (distance > config.combineDistance / 20) {
                        console.warn(`Found duplicate drill hole placements: \n    {x: ${drillPointsRaw[0].x} y: ${drillPointsRaw[0].y } ~= {x: ${drillPointsRaw[1].x} y: ${drillPointsRaw[1].y }`);
                        console.warn(`    distance: ${distance}, threshold: ${config.combineDistance}`);
                    }
                    drillPointsRaw.splice(0, 2, keep);
                    drillPointsRaw.push(keep);
                }
            }

            const drillPoint = drillPointsRaw.shift();
            if (drillPoint) {
                drillPoints.push(drillPoint);
            }
        }

        // quick algo for minimizing distance it moves to next drill
        // this does not optimize for overall distance, just handles next hole positions
        let lastDrill: IGcodeDrillPoint | undefined;
        const findNextDrill = () => {
            const last = lastDrill ?? { x: 0, y: 0 };
            drillPoints.sort((a, b) => {
                return distanceBetween(last, a) - distanceBetween(last, b);
            });
            return drillPoints.shift();
        };

        while (drillPoints.length > 0) {
            lastDrill = findNextDrill();
        
            if (lastDrill !== undefined) {
                gcode.push(`G00 X${lastDrill.x} Y${lastDrill.y}`);
                gcode.push(`G01 Z${lastDrill.z}`);
                gcode.push(`G01 Z${config.safeZ}`);
            }
        }


        gcode.push(`G01 Z${config.safeZ}`);
        gcode.push(`G00 X0 Y0 Z${config.safeZ}`);
        return gcode;
    }
}