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
 * Downloads a JSON object as a file in the browser using modern APIs when available
 * @param data The JSON object to download
 * @param filename The name of the file to download
 */
export async function downloadJsonAsFile(data: unknown, filename: string): Promise<void> {
  // Convert the JSON object to a string with pretty formatting
  const jsonString = JSON.stringify(data, null, 2);
  const blob = new Blob([jsonString], { type: 'application/json' });

  // Check if File System Access API is supported
  if ('showSaveFilePicker' in window) {
    try {
      const handle = await (window as any).showSaveFilePicker({
        suggestedName: filename,
        types: [
          {
            description: 'JSON File',
            accept: { 'application/json': ['.json'] }
          },
          {
            description: 'GeoJSON File',
            accept: { 'application/json': ['.geojson'] }
          }
        ]
      });

      const writable = await handle.createWritable();
      await writable.write(blob);
      await writable.close();
      return;
    } catch (err) {
      // User cancelled or API failed, fall back to the traditional method
      console.log('File System Access API failed, falling back to legacy method');
    }
  }

  // Fallback to traditional method
  downloadJsonAsFileOldSchool(data, filename);
}
