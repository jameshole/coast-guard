const IMAGE_EXTENSIONS = new Set(['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp', 'ico', 'avif', 'bmp']);

export function isImageFile(path: string): boolean {
  const ext = path.split('.').pop()?.toLowerCase();
  return !!ext && IMAGE_EXTENSIONS.has(ext);
}

/** SVGs are images that also have readable source, so they get the Rendered/Code toggle. */
export function isSvgFile(path: string): boolean {
  return path.split('.').pop()?.toLowerCase() === 'svg';
}
