import { PolygonWithRelations } from '@reefguide/types';

/**
 * Format polygons as single text value
 * @param polygon
 */
function formatNotes(polygon: PolygonWithRelations): string {
  const dateFormat = new Intl.DateTimeFormat('en-AU', {
    dateStyle: 'medium',
    timeStyle: 'short'
  });
  return polygon.notes
    .map(note => {
      return `# ${dateFormat.format(note.created_at)} \u2014 ${note.user.email}\n${note.content.trim()}`;
    })
    .join('\n\n');
}

/**
 * Wraps the polygons in a GeoJSON feature collection.
 * @param polygons
 */
export function polygonsToGeoJSON(polygons: PolygonWithRelations[]): any {
  return {
    type: 'FeatureCollection',
    // TODO add bbox? https://datatracker.ietf.org/doc/html/rfc7946#section-5
    features: polygons.map(p => {
      return {
        type: 'Feature',
        // TODO what date format?
        // TODO add comments
        properties: {
          fid: p.id,
          createdAt: p.created_at.toISOString(),
          createdBy: p.user.email,
          notes: formatNotes(p)
        },
        geometry: p.polygon
      };
    })
  };
}
