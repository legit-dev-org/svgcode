import { XMLNode } from "./XMLParser.ts";
import type { Point } from "./Point.ts";

interface PathSegment {
    start: Point;
    end: Point;
    length: number;
}

export class SvgPathParser {
    private segments: PathSegment[] = [];
    private totalLength: number = 0;
    private curveApproximations: number;

    private debug = false;

    constructor(element: XMLNode, curveApproximations: number) {
        if (element.attributes["d"] === undefined) {
            throw new Error("Unexpected path, unable to parse without 'd' attribute");
        }
        this.curveApproximations = curveApproximations;
        this.parsePath(element.attributes["d"]);
    }

    /**
     * Parses the SVG path 'd' attribute string into discrete segments,
     * supporting both absolute (uppercase) and relative (lowercase) commands.
     */
    private parsePath(d: string): void {
        // Regex to match any SVG command letter followed by its arguments
        const commandRegex = /([astvzqchmlASTVZQCHML])\s*([^astvzqchmlASTVZQCHML]*)/g;
        let match: RegExpExecArray | null;

        let currentX = 0;
        let currentY = 0;
        let startX = 0;
        let startY = 0;

        while ((match = commandRegex.exec(d)) !== null) {
            const command = match[1];
            const argsStr = match[2].trim();
            const args = argsStr ? argsStr.split(/[\s,]+/).map(Number) : [];

            let i = 0;
            switch (command) {
                // --- Move To ---
                case 'M':
                    if (args.length >= 2) {
                        currentX = args[0];
                        currentY = args[1];
                        startX = currentX;
                        startY = currentY;
                        i = 2;
                        // Subsequent coordinate pairs after M are treated as implicit L
                        while (i < args.length) {
                            const nextX = args[i];
                            const nextY = args[i + 1];
                            this.addLineSegment(currentX, currentY, nextX, nextY);
                            currentX = nextX;
                            currentY = nextY;
                            i += 2;
                        }
                    }
                    break;
                case 'm':
                    if (args.length >= 2) {
                        currentX += args[0];
                        currentY += args[1];
                        startX = currentX;
                        startY = currentY;
                        i = 2;
                        while (i < args.length) {
                            const nextX = currentX + args[i];
                            const nextY = currentY + args[i + 1];
                            this.addLineSegment(currentX, currentY, nextX, nextY);
                            currentX = nextX;
                            currentY = nextY;
                            i += 2;
                        }
                    }
                    break;

                // --- Line To ---
                case 'L':
                    while (i < args.length) {
                        const nextX = args[i];
                        const nextY = args[i + 1];
                        this.addLineSegment(currentX, currentY, nextX, nextY);
                        currentX = nextX;
                        currentY = nextY;
                        i += 2;
                    }
                    break;
                case 'l':
                    while (i < args.length) {
                        const nextX = currentX + args[i];
                        const nextY = currentY + args[i + 1];
                        this.addLineSegment(currentX, currentY, nextX, nextY);
                        currentX = nextX;
                        currentY = nextY;
                        i += 2;
                    }
                    break;

                // --- Horizontal Line To ---
                case 'H':
                    while (i < args.length) {
                        const nextX = args[i];
                        this.addLineSegment(currentX, currentY, nextX, currentY);
                        currentX = nextX;
                        i++;
                    }
                    break;
                case 'h':
                    while (i < args.length) {
                        const nextX = currentX + args[i];
                        this.addLineSegment(currentX, currentY, nextX, currentY);
                        currentX = nextX;
                        i++;
                    }
                    break;

                // --- Vertical Line To ---
                case 'V':
                    while (i < args.length) {
                        const nextY = args[i];
                        this.addLineSegment(currentX, currentY, currentX, nextY);
                        currentY = nextY;
                        i++;
                    }
                    break;
                case 'v':
                    while (i < args.length) {
                        const nextY = currentY + args[i];
                        this.addLineSegment(currentX, currentY, currentX, nextY);
                        currentY = nextY;
                        i++;
                    }
                    break;

                // --- Cubic Bézier Curve ---
                case 'C':
                    while (i < args.length) {
                        const x1 = args[i], y1 = args[i + 1];
                        const x2 = args[i + 2], y2 = args[i + 3];
                        const x = args[i + 4], y = args[i + 5];
                        this.addCubicBezierSegment(currentX, currentY, x1, y1, x2, y2, x, y);
                        currentX = x;
                        currentY = y;
                        i += 6;
                    }
                    break;
                case 'c':
                    while (i < args.length) {
                        const x1 = currentX + args[i], y1 = currentY + args[i + 1];
                        const x2 = currentX + args[i + 2], y2 = currentY + args[i + 3];
                        const x = currentX + args[i + 4], y = currentY + args[i + 5];
                        this.addCubicBezierSegment(currentX, currentY, x1, y1, x2, y2, x, y);
                        currentX = x;
                        currentY = y;
                        i += 6;
                    }
                    break;

                // --- Quadratic Bézier Curve ---
                case 'Q':
                    while (i < args.length) {
                        const x1 = args[i], y1 = args[i + 1];
                        const x = args[i + 2], y = args[i + 3];
                        this.addQuadraticBezierSegment(currentX, currentY, x1, y1, x, y);
                        currentX = x;
                        currentY = y;
                        i += 4;
                    }
                    break;
                case 'q':
                    while (i < args.length) {
                        const x1 = currentX + args[i], y1 = currentY + args[i + 1];
                        const x = currentX + args[i + 2], y = currentY + args[i + 3];
                        this.addQuadraticBezierSegment(currentX, currentY, x1, y1, x, y);
                        currentX = x;
                        currentY = y;
                        i += 4;
                    }
                    break;

                // --- Close Path ---
                case 'Z':
                case 'z':
                    this.addLineSegment(currentX, currentY, startX, startY);
                    currentX = startX;
                    currentY = startY;
                    break;
            }
        }
    }

    private addLineSegment(x1: number, y1: number, x2: number, y2: number): void {
        const dx = x2 - x1;
        const dy = y2 - y1;
        const length = Math.sqrt(dx * dx + dy * dy);

        if (length > 0) {
            this.segments.push({
                start: { x: x1, y: y1 },
                end: { x: x2, y: y2 },
                length,
            });
            this.totalLength += length;
        }
    }

    private addCubicBezierSegment(
        x0: number, y0: number,
        x1: number, y1: number,
        x2: number, y2: number,
        x3: number, y3: number
    ): void {
        // Approximate cubic bezier curve with small line segments
        const subdivisions = this.curveApproximations;
        let prevX = x0;
        let prevY = y0;

        for (let j = 1; j <= subdivisions; j++) {
            const t = j / subdivisions;
            const mt = 1 - t;
            const x = mt * mt * mt * x0 + 3 * mt * mt * t * x1 + 3 * mt * t * t * x2 + t * t * t * x3;
            const y = mt * mt * mt * y0 + 3 * mt * mt * t * y1 + 3 * mt * t * t * y2 + t * t * t * y3;
            this.addLineSegment(prevX, prevY, x, y);
            prevX = x;
            prevY = y;
        }
    }

    private addQuadraticBezierSegment(
        x0: number, y0: number,
        x1: number, y1: number,
        x2: number, y2: number
    ): void {
        // Approximate quadratic bezier curve with small line segments
        const subdivisions = this.curveApproximations;
        let prevX = x0;
        let prevY = y0;

        for (let j = 1; j <= subdivisions; j++) {
            const t = j / subdivisions;
            const mt = 1 - t;
            const x = mt * mt * x0 + 2 * mt * t * x1 + t * t * x2;
            const y = mt * mt * y0 + 2 * mt * t * y1 + t * t * y2;
            this.addLineSegment(prevX, prevY, x, y);
            prevX = x;
            prevY = y;
        }
    }

    /**
     * Returns the absolute { x, y } coordinates for a given percentage (0 to 1) along the path.
     */
    public getPointForPath(percent: number): Point {
        const clampedPercent = Math.max(0, Math.min(1, percent));

        if (this.segments.length === 0 || this.totalLength === 0) {
            return { x: 0, y: 0 };
        }

        if (clampedPercent === 0) {
            return { ...this.segments[0].start };
        }

        if (clampedPercent === 1) {
            return { ...this.segments[this.segments.length - 1].end };
        }

        const targetDistance = this.totalLength * clampedPercent;
        let accumulatedLength = 0;

        for (const segment of this.segments) {
            if (accumulatedLength + segment.length >= targetDistance) {
                const remainingDistance = targetDistance - accumulatedLength;
                const t = remainingDistance / segment.length;

                return {
                    x: segment.start.x + (segment.end.x - segment.start.x) * t,
                    y: segment.start.y + (segment.end.y - segment.start.y) * t,
                };
            }
            accumulatedLength += segment.length;
        }

        return { ...this.segments[this.segments.length - 1].end };
    }

    public getTotalLength(): number {
        return this.totalLength;
    }
}
