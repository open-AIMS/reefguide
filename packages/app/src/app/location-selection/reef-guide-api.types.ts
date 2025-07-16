import { RegionalAssessmentInput, SuitabilityAssessmentInput } from '@reefguide/types';

/**
 * Criteria values with the keys expected by job system.
 * payload prefix + _min or _max
 * e.g. depth_min, depth_max
 */
export type SelectionCriteria = Omit<RegionalAssessmentInput, 'region'>;

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
 * This is the Form value in the Assess panel.
 */
export interface CriteriaAssessment {
  criteria: SelectionCriteria;
  siteSuitability?: SiteSuitabilityCriteria;
}
