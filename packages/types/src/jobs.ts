import { JobType } from '@reefguide/db';
import { z } from 'zod';

/**
 * Shared criteria schema used across multiple job types.
 * Contains common assessment parameters for regional and suitability assessments.
 */
export const sharedCriteriaSchema = z.object({
  // High level config - common to all current scenarios
  region: z.string().describe('Region for assessment'),
  reef_type: z.string().describe('The type of reef, slopes or flats'),
  // Criteria - all optional to match the Union{Float64,Nothing} in worker
  depth_min: z.number().optional().describe('The depth minimum (the deeper more negative value)'),
  depth_max: z
    .number()
    .optional()
    .describe('The depth maximum (the shallower less negative value)'),
  slope_min: z.number().optional().describe('The slope range (min)'),
  slope_max: z.number().optional().describe('The slope range (max)'),
  rugosity_min: z.number().optional().describe('The rugosity range (min)'),
  rugosity_max: z.number().optional().describe('The rugosity range (max)'),
  waves_period_min: z.number().optional().describe('The wave period range (min)'),
  waves_period_max: z.number().optional().describe('The wave period range (max)'),
  waves_height_min: z.number().optional().describe('The wave height range (min)'),
  waves_height_max: z.number().optional().describe('The wave height range (max)')
});

/**
 * Model parameter schema for ADRIA model runs
 */
export const modelParamSchema = z.object({
  param_name: z.string().describe('Name of the model parameter'),
  third_param_flag: z.boolean().describe('Whether the third parameter is used'),
  lower: z.number().describe('Lower bound for the parameter'),
  upper: z.number().describe('Upper bound for the parameter'),
  optional_third: z
    .number()
    .optional()
    .describe('Optional third parameter (e.g., step size for discrete uniform)')
});

/**
 * Individual job input schemas
 */
export const testJobInputSchema = z
  .object({
    // This is just to break up the hash
    id: z.number()
  })
  .strict();

export const suitabilityAssessmentInputSchema = sharedCriteriaSchema
  .extend({
    x_dist: z.number().describe('Length (m) of the target polygon'),
    y_dist: z.number().describe('Width (m) of the target polygon'),
    threshold: z.number().optional().describe('Suitability threshold integer (min)')
  })
  .strict();

export const regionalAssessmentInputSchema = sharedCriteriaSchema.strict();

export const dataSpecificationUpdateJobInputSchema = z.object({
  cache_buster: z.number().optional().describe('Cache buster to force update')
});

export const adriaModelRunInputSchema = z
  .object({
    // Each data package defines an input domain
    data_package: z
      .enum(['MOORE', 'GBR'])
      .describe('Which data package to use for analysis. MOORE or GBR.'),
    num_scenarios: z
      .number()
      .int()
      .positive()
      .describe('Number of scenarios to run (must be power of 2)'),
    model_params: z.array(modelParamSchema).describe('Array of model parameters for the run'),
    rcp_scenario: z
      .string()
      .optional()
      .default('45')
      .describe('RCP scenario (e.g., "45" for RCP 4.5)')
  })
  .strict();

/**
 * Individual job result schemas
 */
export const testJobResultSchema = z.object({}).strict().optional();

export const suitabilityAssessmentResultSchema = z
  .object({
    geojson_path: z
      .string()
      .describe(
        'Relative path in job storage location to the GeoJSON file containing assessment results'
      )
  })
  .strict();

export const regionalAssessmentResultSchema = z
  .object({
    cog_path: z.string().describe('Relative location of the COG file in the output directory')
  })
  .strict();

export const dataSpecificationUpdateResultSchema = z.object({}).strict();

export const adriaModelRunResultSchema = z
  .object({
    output_result_set_path: z
      .string()
      .describe('The relative location of the result set data package'),
    available_charts: z
      .record(z.string())
      .describe('Map of chart title to the relative file location on S3'),
    chart_metadata: z.record(
      z.object({
        metric_name: z.string(),
        filename: z.string(),
        y_label: z.string(),
        description: z.string(),
        generation_time_seconds: z.number()
      })
    )
  })
  .strict();

/**
 * Exported TypeScript types inferred from schemas
 */
export type SharedCriteria = z.infer<typeof sharedCriteriaSchema>;
export type ModelParam = z.infer<typeof modelParamSchema>;
export type TestJobInput = z.infer<typeof testJobInputSchema>;
export type SuitabilityAssessmentInput = z.infer<typeof suitabilityAssessmentInputSchema>;
export type RegionalAssessmentInput = z.infer<typeof regionalAssessmentInputSchema>;
export type DataSpecificationUpdateJobInput = z.infer<typeof dataSpecificationUpdateJobInputSchema>;
export type AdriaModelRunInput = z.infer<typeof adriaModelRunInputSchema>;
export type TestJobResult = z.infer<typeof testJobResultSchema>;
export type SuitabilityAssessmentResult = z.infer<typeof suitabilityAssessmentResultSchema>;
export type RegionalAssessmentResult = z.infer<typeof regionalAssessmentResultSchema>;
export type DataSpecificationUpdateJobResult = z.infer<typeof dataSpecificationUpdateResultSchema>;
export type AdriaModelRunResult = z.infer<typeof adriaModelRunResultSchema>;

/**
 * Schema definitions for each job type's input and output payloads.
 * Each job type must define an input schema and may optionally define a result schema.
 */
export const jobTypeSchemas: JobSchemaMap = {
  TEST: {
    input: testJobInputSchema,
    result: testJobResultSchema
  },
  // The suitability assessment job takes in regional parameters and returns the location of the file relative to the job storage location.
  SUITABILITY_ASSESSMENT: {
    input: suitabilityAssessmentInputSchema,
    result: suitabilityAssessmentResultSchema
  },
  REGIONAL_ASSESSMENT: {
    input: regionalAssessmentInputSchema,
    result: regionalAssessmentResultSchema
  },
  DATA_SPECIFICATION_UPDATE: {
    input: dataSpecificationUpdateJobInputSchema,
    result: dataSpecificationUpdateResultSchema
  },
  ADRIA_MODEL_RUN: {
    input: adriaModelRunInputSchema,
    result: adriaModelRunResultSchema
  }
};

export const jobExpiryMap: JobExpiryMap = {
  TEST: {
    // expires in one hour
    expiryMinutes: 60
  },
  SUITABILITY_ASSESSMENT: {
    // expires in one hour
    expiryMinutes: 60
  },
  ADRIA_MODEL_RUN: {
    // expires in 4 hours (model runs may take longer)
    expiryMinutes: 240
  }
};

/** Job type map */
type JobSchemaMap = {
  [K: string]: {
    input: z.ZodSchema<any>;
    result?: z.ZodSchema<any>;
  };
};

/** Expiry time map */
type JobExpiryMap = {
  [K in JobType]?: {
    expiryMinutes: number;
  };
};
