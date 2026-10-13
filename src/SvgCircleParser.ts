import { XMLNode } from "./XMLParser.ts";
import type { Point } from "./Point.ts";

export class SvgCircleParser {
    public static getOrigin(circle: XMLNode): Point {
        const cxAtt = circle.attributes["cx"];
        const cyAtt = circle.attributes["cy"];
        if (!cxAtt || !cyAtt) {
            throw new Error(`missing cx cy '${JSON.stringify(circle.attributes)}'`);
        }

        let cx = parseFloat(cxAtt);
        let cy = parseFloat(cyAtt);
        if (!Number.isFinite(cx) || !Number.isFinite(cy)) {
            throw new Error("non number cx/cy");
        }

        const transform = circle.attributes["transform"];
        if (transform) {
            const matrixIdx = transform.indexOf(`matrix(`);
            const matrix = transform.substring(matrixIdx + 7, transform.indexOf(")", matrixIdx + 7));
            const matrixParts = matrix.split(",").map((i) => i.trim());
            if (matrixParts.length !== 6) {
                throw new Error("Invalid matrix string");
            }

            const matrixNums = matrixParts.map((m) => parseFloat(m));
            for (const n of matrixNums) {
                if(!isFinite(n)) {
                    throw new Error("Invalid matrix number");
                }
            }
            cx = cx * matrixNums[0] + cy * matrixNums[2] + matrixNums[4];
            cy = cx * matrixNums[1] + cy * matrixNums[3] + matrixNums[5];
        }

        return { x: cx, y: cy };
    }
}
