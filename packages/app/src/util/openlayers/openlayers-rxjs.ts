import BaseObject, { ObjectEvent } from 'ol/Object';
import { fromEventPattern, map, Observable, startWith } from 'rxjs';
import { Extent } from 'ol/extent';
import { Source } from 'ol/source';
import { Map as OLMap } from 'ol';
import OLBaseEvent from 'ol/events/Event';
import { TileSourceEvent } from 'ol/source/Tile';
import { EventsKey } from 'ol/events';

/**
 * Create an Observable from an OpenLayer's object event.
 * @param obj
 * @param eventName
 *
 * TODO fix V type, it can be ObjectEvent
 */
export function fromOpenLayersEvent<
  V = OLBaseEvent | ObjectEvent | TileSourceEvent,
  O extends BaseObject = BaseObject,
  E = Parameters<O['on']>[0]
>(obj: O, eventName: E): Observable<V> {
  return fromEventPattern<V>(
    // TODO figure out why eventName type check not happy
    handler => obj.on(eventName as any, handler),
    (handler, key: EventsKey) => obj.un(eventName as any, handler)
  );
}

// map OpenLayer object property names to their values
type OpenLayersPropertyValueMap = {
  opacity: number;
  visible: boolean;
  extent: Extent;
  zIndex: number;
  maxResolution: number;
  minResolution: number;
  maxZoom: number;
  minZoom: number;
  source: Source | null;
  map: OLMap | null;
};

/**
 * Subscribe to OpenLayers object property value changes.
 * Emits the current value if not null | undefined.
 * @param obj
 * @param property
 */
export function fromOpenLayersProperty<
  O extends BaseObject,
  P extends keyof OpenLayersPropertyValueMap,
  V = OpenLayersPropertyValueMap[P]
>(obj: O, property: P): Observable<V> {
  const futureValues$ = fromEventPattern(
    handler => obj.addChangeListener(property, handler),
    handler => obj.removeChangeListener(property, handler)
  ).pipe(map(() => obj.get(property)));

  const currentValue = obj.get(property);
  if (currentValue != null) {
    return futureValues$.pipe(startWith(currentValue));
  } else {
    return futureValues$;
  }
}

/**
 * Subscribe to OpenLayers property changes.
 *
 * Alternate version with type derived from get function.
 *
 * @param obj
 * @param eventName
 * @param get
 */
export function fromOpenLayersProperty2<V, O extends BaseObject, E = Parameters<O['on']>[0]>(
  obj: O,
  eventName: E,
  get: () => V
): Observable<V> {
  // replace event value with the current value
  obj.addChangeListener('foo', () => {});
  const futureValues$: Observable<V> = fromOpenLayersEvent(obj, eventName).pipe(map(() => get()));
  const currentValue = get();
  if (currentValue != null) {
    return futureValues$.pipe(startWith(currentValue));
  } else {
    return futureValues$;
  }
}
