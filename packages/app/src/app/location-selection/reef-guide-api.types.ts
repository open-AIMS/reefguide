import { RegionalAssessmentInput, SuitabilityAssessmentInput } from '@reefguide/types';

/**
 * The properties unique to Site Suitability payload
 * TODO ideally calculated type = SuitabilityAssessmentInput - RegionalAssessmentInput
 */
export type SiteSuitabilityCriteria = Pick<
  SuitabilityAssessmentInput,
  'x_dist' | 'y_dist' | 'threshold'
>;

/**
 * Separated Job payloads for REGIONAL_ASSESSMENT and SUITABILITY_ASSESSMENT
 */
export interface CriteriaPayloads {
  criteria: RegionalAssessmentInput;
  siteSuitability?: SiteSuitabilityCriteria;
}
