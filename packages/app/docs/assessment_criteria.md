# Assessment Criteria

The criteria used by some ReefGuide jobs is defined by the [data spec system](../../../docs/prompting-data-spec-reload.md).
This information is primarily used within the [SelectionCriteriaComponent](../src/app/location-selection/selection-criteria/selection-criteria.component.ts).

This component makes a few adjustments/hacks described here.

## Criteria Order

Currently, the data spec system does not define the order for criteria to be displayed in the app; so this is hardcoded in the `criteriaOrder` field.

## Hidden Criteria

Not all regions have the same criteria. For example, only "Townsville-Whitsunday" has Rugosity.

There is a hack in the app code to hide `Turbidity`.  
See: `SelectionCriteriaComponent.disabledCriteria`

## Low-tide to High-tide depth

This is a special slider created by the app when `LowTide`, `HighTide` and `Depth` criteria are all present and replaces the depth slider. It maps each end of the slider to `low_tide_max` and `high_tide_min`.

See code:
* `SelectionCriteriaComponent.buildCriteriaFormGroup`
* `SelectionCriteriaComponent.getCriteriaPayloads`

## Depth - numeric values inversion

At the ReefGuide and API layer, depth values are negative. However, within the UI and app code they are positive. See uses of `SelectionCriteriaComponent.negativeFlippedCriteria` in the code.
