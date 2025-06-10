import {z} from 'zod';

// Define a schema for a single coordinate pair
export const GeoJSONCoordinatePairSchema = z
  .tuple([z.number(), z.number()])
  .refine(
    ([lon, lat]) => lon >= -180 && lon <= 180 && lat >= -90 && lat <= 90,
    {
      message:
        'Invalid coordinate pair. Longitude must be between -180 and 180, latitude between -90 and 90.',
    },
  );
export type GeoJSONCoordinatePair = z.infer<typeof GeoJSONCoordinatePairSchema>;

// Define a schema for a linear ring (closed line string)
export const GeoJSONLinearRingSchema = z
  .array(GeoJSONCoordinatePairSchema)
  .min(4)
  .refine(
    coords =>
      coords[0][0] === coords[coords.length - 1][0] &&
      coords[0][1] === coords[coords.length - 1][1],
    {
      message: 'Linear ring must start and end with the same coordinate pair.',
    },
  );
export type GeoJSONLinearRing = z.infer<typeof GeoJSONLinearRingSchema>;

// Define the schema for a Polygon. NOTE this does not check for interior rings etc.
export const GeoJSONPolygonSchema = z.object({
  type: z.literal('Polygon'),
  coordinates: z
    .array(GeoJSONLinearRingSchema)
    .min(1, 'Must provide at least one set of coordinates for a polygon.'),
});
export type GeoJSONPolygon = z.infer<typeof GeoJSONPolygonSchema>;
