// Type definition for any JSON-serializable value
export type JSONValue =
  | string
  | number
  | boolean
  | null
  | JSONValue[]
  | {[key: string]: JSONValue};

// Interface for the normalized object structure
export interface NormalizedObject {
  [key: string]: JSONValue;
}
