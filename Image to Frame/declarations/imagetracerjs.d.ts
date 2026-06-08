declare module "imagetracerjs" {
  export function imageToSVG(
    url: string,
    callback: (svgStr: string) => void,
    options?: any
  ): void;

  export function imagedataToSVG(
    imgd: ImageData,
    options?: any
  ): string;
}
