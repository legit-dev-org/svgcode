import { XMLNode } from "./XMLParser.ts";

export interface Point {
    x: number;
    y: number;
}

interface PathSegment {
    start: Point;
    end: Point;
    length: number;
}

export class PathShape {
    public segments: Array<PathSegment>;
    public totalLength: number;
    constructor(
        segments: PathSegment[],
        totalLength: number,
    ) {
        this.segments = segments;
        this.totalLength = totalLength;
    }

    /**
     * Returns the absolute { x, y } coordinates for a given percentage (0 to 1) 
     * along this specific shape path.
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
}

export class SvgPathParser {
    private shapes: PathShape[] = [];
    private currentSegments: PathSegment[] = [];
    private currentShapeLength: number = 0;
    private curveApproximations: number;

    constructor(node: XMLNode, curveApproximations: number) {
        this.curveApproximations = curveApproximations;
        if (node.attributes["d"] === undefined) {
            throw new Error("Missing 'd' attribute on SVG path node");
        }

        this.parsePath(node.attributes["d"]);
    }

    private flushCurrentShape(): void {
        if (this.currentSegments.length > 0) {
            this.shapes.push(new PathShape(this.currentSegments, this.currentShapeLength));
            this.currentSegments = [];
            this.currentShapeLength = 0;
        }
    }

    private addLineSegment(x1: number, y1: number, x2: number, y2: number): void {
        const dx = x2 - x1;
        const dy = y2 - y1;
        const length = Math.sqrt(dx * dx + dy * dy);

        if (length > 0) {
            const segment: PathSegment = {
                start: { x: x1, y: y1 },
                end: { x: x2, y: y2 },
                length,
            };
            this.currentSegments.push(segment);
            this.currentShapeLength += length;
        }
    }

    private addCubicBezierSegment(
        x0: number, y0: number, x1: number, y1: number,
        x2: number, y2: number, x3: number, y3: number
    ): void {
        const subdivisions = this.curveApproximations;
        let prevX = x0, prevY = y0;
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
        x0: number, y0: number, x1: number, y1: number, x2: number, y2: number
    ): void {
        const subdivisions = this.curveApproximations;
        let prevX = x0, prevY = y0;
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

    private addArcSegment(
        x1: number, y1: number,
        rx: number, ry: number,
        angle: number,
        largeArcFlag: number, sweepFlag: number,
        x2: number, y2: number
    ): void {
        if (x1 === x2 && y1 === y2) return;

        rx = Math.abs(rx);
        ry = Math.abs(ry);
        if (rx === 0 || ry === 0) {
            this.addLineSegment(x1, y1, x2, y2);
            return;
        }

        const phi = (angle * Math.PI) / 180;
        const cosPhi = Math.cos(phi);
        const sinPhi = Math.sin(phi);

        const dx2 = (x1 - x2) / 2;
        const dy2 = (y1 - y2) / 2;
        const x1Prime = cosPhi * dx2 + sinPhi * dy2;
        const y1Prime = -sinPhi * dx2 + cosPhi * dy2;

        let rxSq = rx * rx;
        let rySq = ry * ry;
        const x1PrimeSq = x1Prime * x1Prime;
        const y1PrimeSq = y1Prime * y1Prime;

        const radiiCheck = x1PrimeSq / rxSq + y1PrimeSq / rySq;
        if (radiiCheck > 1) {
            rx *= Math.sqrt(radiiCheck);
            ry *= Math.sqrt(radiiCheck);
            rxSq = rx * rx;
            rySq = ry * ry;
        }

        const sign = largeArcFlag === sweepFlag ? -1 : 1;
        const num = rxSq * rySq - rxSq * y1PrimeSq - rySq * x1PrimeSq;
        const den = rxSq * y1PrimeSq + rySq * x1PrimeSq;
        const coef = sign * Math.sqrt(Math.max(0, num / den));

        const cxPrime = coef * ((rx * y1Prime) / ry);
        const cyPrime = coef * (-(ry * x1Prime) / rx);

        const cx = cosPhi * cxPrime - sinPhi * cyPrime + (x1 + x2) / 2;
        const cy = sinPhi * cxPrime + cosPhi * cyPrime + (y1 + y2) / 2;

        const vectorAngle = (ux: number, uy: number, vx: number, vy: number) => {
            const dot = ux * vx + uy * vy;
            let ang = Math.acos(Math.max(-1, Math.min(1, dot)));
            if (ux * vy - uy * vx < 0) ang = -ang;
            return ang;
        };

        const ux = (x1Prime - cxPrime) / rx;
        const uy = (y1Prime - cyPrime) / ry;
        const vx = (-x1Prime - cxPrime) / rx;
        const vy = (-y1Prime - cyPrime) / ry;

        let theta1 = vectorAngle(1, 0, ux, uy);
        let dTheta = vectorAngle(ux, uy, vx, vy);

        if (!sweepFlag && dTheta > 0) {
            dTheta -= 2 * Math.PI;
        } else if (sweepFlag && dTheta < 0) {
            dTheta += 2 * Math.PI;
        }

        const subdivisions = Math.max(this.curveApproximations, Math.ceil(Math.abs(dTheta) * this.curveApproximations));
        let prevX = x1, prevY = y1;

        for (let j = 1; j <= subdivisions; j++) {
            const t = j / subdivisions;
            const theta = theta1 + dTheta * t;
            const cosTheta = Math.cos(theta);
            const sinTheta = Math.sin(theta);

            const tx = rx * cosTheta;
            const ty = ry * sinTheta;

            const x = cosPhi * tx - sinPhi * ty + cx;
            const y = sinPhi * tx + cosPhi * ty + cy;

            this.addLineSegment(prevX, prevY, x, y);
            prevX = x;
            prevY = y;
        }
    }

    private parsePath(d: string): void {
        // Tokenize into command letters and numbers
        const tokens = d.match(/[a-df-z]|[\+\-]?[0-9]*\.?[0-9]+(?:[eE][-+]?[0-9]+)?/gi);
        if (!tokens) return;

        let idx = 0;
        let currentCommand = '';

        let currentX = 0;
        let currentY = 0;
        let startX = 0;
        let startY = 0;
        let lastControlX = 0;
        let lastControlY = 0;
        let lastCommand = '';

        const hasNext = () => idx < tokens.length;
        const peek = () => tokens[idx];
        const consume = () => tokens[idx++];

        while (hasNext()) {
            const token = peek();
            if (/^[a-df-z]$/i.test(token)) {
                currentCommand = consume();
            } else {
                // Handle implicit command repetition (e.g., multiple coordinate pairs after M/m or L/l)
                if (currentCommand === 'M') currentCommand = 'L';
                else if (currentCommand === 'm') currentCommand = 'l';
            }

            const cmd = currentCommand;
            lastCommand = cmd;

            switch (cmd) {
                case 'M': {
                    this.flushCurrentShape();
                    currentX = parseFloat(consume());
                    currentY = parseFloat(consume());
                    startX = currentX;
                    startY = currentY;
                    while (hasNext() && !/^[a-df-z]$/i.test(peek())) {
                        const nextX = parseFloat(consume());
                        const nextY = parseFloat(consume());
                        this.addLineSegment(currentX, currentY, nextX, nextY);
                        currentX = nextX;
                        currentY = nextY;
                    }
                    break;
                }
                case 'm': {
                    this.flushCurrentShape();
                    currentX += parseFloat(consume());
                    currentY += parseFloat(consume());
                    startX = currentX;
                    startY = currentY;
                    while (hasNext() && !/^[a-df-z]$/i.test(peek())) {
                        const nextX = currentX + parseFloat(consume());
                        const nextY = currentY + parseFloat(consume());
                        this.addLineSegment(currentX, currentY, nextX, nextY);
                        currentX = nextX;
                        currentY = nextY;
                    }
                    break;
                }
                case 'L': {
                    while (hasNext() && !/^[a-df-z]$/i.test(peek())) {
                        const nextX = parseFloat(consume());
                        const nextY = parseFloat(consume());
                        this.addLineSegment(currentX, currentY, nextX, nextY);
                        currentX = nextX;
                        currentY = nextY;
                    }
                    break;
                }
                case 'l': {
                    while (hasNext() && !/^[a-df-z]$/i.test(peek())) {
                        const nextX = currentX + parseFloat(consume());
                        const nextY = currentY + parseFloat(consume());
                        this.addLineSegment(currentX, currentY, nextX, nextY);
                        currentX = nextX;
                        currentY = nextY;
                    }
                    break;
                }
                case 'H': {
                    while (hasNext() && !/^[a-df-z]$/i.test(peek())) {
                        const nextX = parseFloat(consume());
                        this.addLineSegment(currentX, currentY, nextX, currentY);
                        currentX = nextX;
                    }
                    break;
                }
                case 'h': {
                    while (hasNext() && !/^[a-df-z]$/i.test(peek())) {
                        const nextX = currentX + parseFloat(consume());
                        this.addLineSegment(currentX, currentY, nextX, currentY);
                        currentX = nextX;
                    }
                    break;
                }
                case 'V': {
                    while (hasNext() && !/^[a-df-z]$/i.test(peek())) {
                        const nextY = parseFloat(consume());
                        this.addLineSegment(currentX, currentY, currentX, nextY);
                        currentY = nextY;
                    }
                    break;
                }
                case 'v': {
                    while (hasNext() && !/^[a-df-z]$/i.test(peek())) {
                        const nextY = currentY + parseFloat(consume());
                        this.addLineSegment(currentX, currentY, currentX, nextY);
                        currentY = nextY;
                    }
                    break;
                }
                case 'C': {
                    while (hasNext() && !/^[a-df-z]$/i.test(peek())) {
                        const x1 = parseFloat(consume()), y1 = parseFloat(consume());
                        const x2 = parseFloat(consume()), y2 = parseFloat(consume());
                        const x = parseFloat(consume()), y = parseFloat(consume());
                        this.addCubicBezierSegment(currentX, currentY, x1, y1, x2, y2, x, y);
                        lastControlX = x2;
                        lastControlY = y2;
                        currentX = x;
                        currentY = y;
                    }
                    break;
                }
                case 'c': {
                    while (hasNext() && !/^[a-df-z]$/i.test(peek())) {
                        const x1 = currentX + parseFloat(consume());
                        const y1 = currentY + parseFloat(consume());
                        const x2 = currentX + parseFloat(consume());
                        const y2 = currentY + parseFloat(consume());
                        const x = currentX + parseFloat(consume());
                        const y = currentY + parseFloat(consume());
                        this.addCubicBezierSegment(currentX, currentY, x1, y1, x2, y2, x, y);
                        lastControlX = x2;
                        lastControlY = y2;
                        currentX = x;
                        currentY = y;
                    }
                    break;
                }
                case 'S': {
                    while (hasNext() && !/^[a-df-z]$/i.test(peek())) {
                        const x1 = ['C', 'c', 'S', 's'].includes(lastCommand) ? 2 * currentX - lastControlX : currentX;
                        const y1 = ['C', 'c', 'S', 's'].includes(lastCommand) ? 2 * currentY - lastControlY : currentY;
                        const x2 = parseFloat(consume()), y2 = parseFloat(consume());
                        const x = parseFloat(consume()), y = parseFloat(consume());
                        this.addCubicBezierSegment(currentX, currentY, x1, y1, x2, y2, x, y);
                        lastControlX = x2;
                        lastControlY = y2;
                        currentX = x;
                        currentY = y;
                    }
                    break;
                }
                case 's': {
                    while (hasNext() && !/^[a-df-z]$/i.test(peek())) {
                        const x1 = ['C', 'c', 'S', 's'].includes(lastCommand) ? 2 * currentX - lastControlX : currentX;
                        const y1 = ['C', 'c', 'S', 's'].includes(lastCommand) ? 2 * currentY - lastControlY : currentY;
                        const x2 = currentX + parseFloat(consume());
                        const y2 = currentY + parseFloat(consume());
                        const x = currentX + parseFloat(consume());
                        const y = currentY + parseFloat(consume());
                        this.addCubicBezierSegment(currentX, currentY, x1, y1, x2, y2, x, y);
                        lastControlX = x2;
                        lastControlY = y2;
                        currentX = x;
                        currentY = y;
                    }
                    break;
                }
                case 'Q': {
                    while (hasNext() && !/^[a-df-z]$/i.test(peek())) {
                        const x1 = parseFloat(consume()), y1 = parseFloat(consume());
                        const x = parseFloat(consume()), y = parseFloat(consume());
                        this.addQuadraticBezierSegment(currentX, currentY, x1, y1, x, y);
                        lastControlX = x1;
                        lastControlY = y1;
                        currentX = x;
                        currentY = y;
                    }
                    break;
                }
                case 'q': {
                    while (hasNext() && !/^[a-df-z]$/i.test(peek())) {
                        const x1 = currentX + parseFloat(consume());
                        const y1 = currentY + parseFloat(consume());
                        const x = currentX + parseFloat(consume());
                        const y = currentY + parseFloat(consume());
                        this.addQuadraticBezierSegment(currentX, currentY, x1, y1, x, y);
                        lastControlX = x1;
                        lastControlY = y1;
                        currentX = x;
                        currentY = y;
                    }
                    break;
                }
                case 'T': {
                    while (hasNext() && !/^[a-df-z]$/i.test(peek())) {
                        const x1 = ['Q', 'q', 'T', 't'].includes(lastCommand) ? 2 * currentX - lastControlX : currentX;
                        const y1 = ['Q', 'q', 'T', 't'].includes(lastCommand) ? 2 * currentY - lastControlY : currentY;
                        const x = parseFloat(consume()), y = parseFloat(consume());
                        this.addQuadraticBezierSegment(currentX, currentY, x1, y1, x, y);
                        lastControlX = x1;
                        lastControlY = y1;
                        currentX = x;
                        currentY = y;
                    }
                    break;
                }
                case 't': {
                    while (hasNext() && !/^[a-df-z]$/i.test(peek())) {
                        const x1 = ['Q', 'q', 'T', 't'].includes(lastCommand) ? 2 * currentX - lastControlX : currentX;
                        const y1 = ['Q', 'q', 'T', 't'].includes(lastCommand) ? 2 * currentY - lastControlY : currentY;
                        const x = currentX + parseFloat(consume());
                        const y = currentY + parseFloat(consume());
                        this.addQuadraticBezierSegment(currentX, currentY, x1, y1, x, y);
                        lastControlX = x1;
                        lastControlY = y1;
                        currentX = x;
                        currentY = y;
                    }
                    break;
                }
                case 'A': {
                    while (hasNext() && !/^[a-df-z]$/i.test(peek())) {
                        const rx = parseFloat(consume()), ry = parseFloat(consume()), rot = parseFloat(consume());
                        const largeArc = parseFloat(consume()), sweep = parseFloat(consume());
                        const x = parseFloat(consume()), y = parseFloat(consume());
                        this.addArcSegment(currentX, currentY, rx, ry, rot, largeArc, sweep, x, y);
                        currentX = x;
                        currentY = y;
                    }
                    break;
                }
                case 'a': {
                    while (hasNext() && !/^[a-df-z]$/i.test(peek())) {
                        const rx = parseFloat(consume()), ry = parseFloat(consume()), rot = parseFloat(consume());
                        const largeArc = parseFloat(consume()), sweep = parseFloat(consume());
                        const x = currentX + parseFloat(consume()), y = currentY + parseFloat(consume());
                        this.addArcSegment(currentX, currentY, rx, ry, rot, largeArc, sweep, x, y);
                        currentX = x;
                        currentY = y;
                    }
                    break;
                }
                case 'Z':
                case 'z': {
                    this.addLineSegment(currentX, currentY, startX, startY);
                    currentX = startX;
                    currentY = startY;
                    this.flushCurrentShape();
                    currentCommand = '';
                    break;
                }
            }

            if (!['C', 'c', 'S', 's', 'Q', 'q', 'T', 't'].includes(cmd)) {
                lastControlX = currentX;
                lastControlY = currentY;
            }
        }

        this.flushCurrentShape();
    }

    /**
     * Returns all parsed individual shape paths independently.
     */
    public getShapes(): PathShape[] {
        return this.shapes;
    }
}