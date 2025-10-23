export function isDefined<T>(value: T | undefined | null): value is T {
  return value != null;
}

/**
 * Downloads the Blob as a file in the browser.
 * Uses old method of createObjectURL, temporary <a download> element.
 * @param data The file data to download
 * @param filename The name of the file to download
 */
function downloadFileOldSchool(data: Blob, filename: string): void {
  // Create a URL for the Blob
  const url = URL.createObjectURL(data);

  // Create a temporary anchor element
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;

  // Append to the DOM, click it, then remove it
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);

  // Clean up by revoking the URL
  URL.revokeObjectURL(url);
}

/**
 * Mapping of file extension to file picker type entry
 */
const filePickerTypes: Array<{ description: string; accept: Record<string, Array<string>> }> = [
  {
    description: 'GeoJSON File',
    accept: { 'application/geo_json': ['.geojson', '.json'] }
  },
  {
    description: 'JSON File',
    accept: { 'application/json': ['.json'] }
  },
  {
    description: 'KML File',
    accept: { 'application/vnd.google-earth.kml+xml': ['.kml'] }
  }
];

/**
 * Downloads file in the browser using modern file system APIs when available.
 * @param data The JSON object or Blob to download
 * @param filename The name of the file to download (including lowercase extension)
 * @throws AbortError if user cancels
 */
export async function downloadFile(data: object | Blob, filename: string): Promise<void> {
  let fileMimetype: string | undefined = undefined;
  // determine what picker types apply to this file based on extension in filename
  // TODO better to use content-type from response instead of file extension inspection.
  const availableFilePickerTypes = filePickerTypes.filter(t => {
    for (const mimetype in t.accept) {
      const extensions = t.accept[mimetype];
      if (extensions.find(extension => filename.endsWith(extension))) {
        // set Blob mimetype to the first one that matches
        fileMimetype = mimetype;
        return true;
      }
    }
    return false;
  });

  let blob: Blob;
  if (data instanceof Blob) {
    blob = data;
  } else {
    // Convert the JSON object to a string with pretty formatting
    const jsonString = JSON.stringify(data, null, 2);
    blob = new Blob([jsonString], { type: fileMimetype });
  }

  // Check if File System Access API is supported
  if ('showSaveFilePicker' in window) {
    try {
      const handle = await (window as any).showSaveFilePicker({
        suggestedName: filename,
        types: availableFilePickerTypes
      });

      const writable = await handle.createWritable();
      await writable.write(blob);
      await writable.close();
      return;
    } catch (err) {
      // AbortError not available/importable? this works
      if (err instanceof Error && err.name === 'AbortError') {
        throw err;
      }

      console.warn('File System Access API failed, falling back to legacy method', err);
    }
  }

  // Fallback to traditional method
  downloadFileOldSchool(blob, filename);
}
