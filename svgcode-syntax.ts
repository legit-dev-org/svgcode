const _safeZ = 10;
const _slowSpeed = 1000;
const _fastSpeed = 2000;
const _drillZ = 0;
const _drillCombineDistance = 1;
const _pathZ = 0;
const _pathIterationsPerMM = 1;
const _pathLinearTolerance = 1e-3;
const _pathCurveApproximations = 100;

export const configJsonDetails = {
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
    pathIterationsPerMM: {
        default: `${_pathIterationsPerMM}`,
        description: "Iterations of the path as movement operations per mm, unless specified by pathRoots items",
    },
    pathCurveApproximations: {
        default: `${_pathCurveApproximations}`,
        description: "Number of approximations used on path curves",
    },
    pathLinearTolerance: {
        efault: `${_pathLinearTolerance}`,
        description: "Amount of tolerance when reducing linear paths",
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
            iterationsPerMM: {
                description: "Iterations of the path as movement operations per mm"
            },
            curveApproximations: {
                description: "Number of approximations used on path curves",
            }
        },
    }
};

export const configDefaults = {
    _safeZ,
    _slowSpeed,
    _fastSpeed,
    _drillZ,
    _drillCombineDistance,
    _pathZ,
    _pathIterationsPerMM,
    _pathLinearTolerance,
    _pathCurveApproximations
};
