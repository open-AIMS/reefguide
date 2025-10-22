export function isDefined<T>(value: T | undefined | null): value is T {
  return value != null;
}

/**
 * Downloads a JSON object as a file in the browser
 * @param data The JSON object to download
 * @param filename The name of the file to download
 */
function downloadJsonAsFileOldSchool(data: unknown, filename: string): void {
  // Convert the JSON object to a string with pretty formatting
  const jsonString = JSON.stringify(data, null, 2);

  // Create a Blob containing the JSON data
  const blob = new Blob([jsonString], { type: 'application/json' });

  // Create a URL for the Blob
  const url = URL.createObjectURL(blob);

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
 * Downloads JSON/GeoJSON as a file in the browser using modern APIs when available
 * @param data The JSON object or Blob to download
 * @param filename The name of the file to download
 */
export async function downloadJsonAsFile(data: object | Blob, filename: string): Promise<void> {
  let mimetype: string = 'application/json';
  let extension: string = '.json';
  const filePickerTypes: any = [
    {
      description: 'JSON File',
      accept: { [mimetype]: [extension] }
    }
  ];

  if (filename.endsWith('.geojson')) {
    mimetype = 'application/geo+json';
    extension = '.geojson';
    filePickerTypes.push({
      description: 'GeoJSON File',
      accept: { [mimetype]: [extension] }
    });
  }

  let blob: Blob;
  if (data instanceof Blob) {
    blob = data;
  } else {
    // Convert the JSON object to a string with pretty formatting
    const jsonString = JSON.stringify(data, null, 2);
    blob = new Blob([jsonString], { type: mimetype });
  }

  // Check if File System Access API is supported
  if ('showSaveFilePicker' in window) {
    try {
      const handle = await (window as any).showSaveFilePicker({
        suggestedName: filename,
        types: filePickerTypes
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
  downloadJsonAsFileOldSchool(data, filename);
}
