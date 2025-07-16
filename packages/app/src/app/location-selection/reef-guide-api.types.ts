import { RegionalAssessmentInput, SuitabilityAssessmentInput } from '@reefguide/types';

/**
 * The properties added for Site Suitability
 * TODO ideally calculated type = SuitabilityAssessmentInput - RegionalAssessmentInput
 */
export type SiteSuitabilityCriteria = Pick<
  SuitabilityAssessmentInput,
  'x_dist' | 'y_dist' | 'threshold'
>;

/**
 * Separation of criteria from site suitability.
 */
export interface CriteriaAssessment {
  criteria: RegionalAssessmentInput;
  siteSuitability?: SiteSuitabilityCriteria;
}
