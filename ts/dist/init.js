"use strict";
/* Copyright © 2021-2025 Voxgig Ltd, MIT License. */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.initModel = initModel;
const node_path_1 = __importDefault(require("node:path"));
const STARTER_MODEL = `# Voxgig model. Edit this file, then build it:
#   voxgig-model model/model.aontu
#
# Models are unified .aontu - add types, defaults, references, imports.
# Tutorial: https://github.com/voxgig/model/blob/main/docs/tutorial.md

name: 'my-model'
`;
const STARTER_CONFIG = `# Model configuration. Declare build actions and their order here.
#
# Example (TypeScript loads the module; Go binds the name to a
# registered action func):
#   sys: model: action: { example: load: 'build/example' }
#   sys: model: order: action: 'example'

sys: model: action: {}
sys: model: order: action: *''
`;
// Scaffold a starter model and config under <dir>/model. Existing files are
// left untouched.
function initModel(dir, fs) {
    const d = dir || '.';
    const files = [
        [node_path_1.default.join(d, 'model', 'model.aontu'), STARTER_MODEL],
        [node_path_1.default.join(d, 'model', '.model-config', 'model-config.aontu'), STARTER_CONFIG],
    ];
    const created = [];
    const skipped = [];
    for (const [p, content] of files) {
        if (fs.existsSync(p)) {
            skipped.push(p);
            continue;
        }
        fs.mkdirSync(node_path_1.default.dirname(p), { recursive: true });
        fs.writeFileSync(p, content);
        created.push(p);
    }
    return { created, skipped };
}
//# sourceMappingURL=init.js.map