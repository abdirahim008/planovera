// The `dxf` package ships no type declarations. We only use it dynamically in
// the drawing studio to convert AutoCAD DXF text into an SVG string via
// `new Helper(text).toSVG()`, so a minimal ambient declaration is enough.
declare module "dxf" {
  export class Helper {
    constructor(dxfText: string);
    toSVG(): string;
    parse(): unknown;
  }
  const _default: { Helper: typeof Helper };
  export default _default;
}
