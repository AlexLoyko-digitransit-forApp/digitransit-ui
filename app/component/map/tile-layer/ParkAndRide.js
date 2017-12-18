import { Store } from 'react-relay/classic';
import { graphql, fetchQuery } from 'relay-runtime';
import { VectorTile } from '@mapbox/vector-tile';
import isEmpty from 'lodash/isEmpty';
import pick from 'lodash/pick';
import Protobuf from 'pbf';

import { drawParkAndRideIcon } from '../../../util/mapIconUtils';
import { Contour } from '../../../util/geo-utils';
import { isBrowser } from '../../../util/browser';

const showFacilities = 17;

export default class ParkAndRide {
  constructor(tile, config) {
    this.tile = tile;
    this.config = config;
    const scaleratio = (isBrowser && window.devicePixelRatio) || 1;
    this.width = 24 * scaleratio;
    this.height = 12 * scaleratio;
    this.promise = this.getPromise();
  }

  static getName = () => 'parkAndRide';

  getPromise() {
    return fetch(
      `${this.config.URL.PARK_AND_RIDE_MAP}${this.tile.coords.z +
        (this.tile.props.zoomOffset || 0)}` +
        `/${this.tile.coords.x}/${this.tile.coords.y}.pbf`,
    ).then(res => {
      if (res.status !== 200) {
        return undefined;
      }

      return res.arrayBuffer().then(
        buf => {
          const vt = new VectorTile(new Protobuf(buf));

          this.features = [];

          if (this.tile.coords.z < showFacilities && vt.layers.hubs != null) {
            for (let i = 0, ref = vt.layers.hubs.length - 1; i <= ref; i++) {
              const feature = vt.layers.hubs.feature(i);
              fetchQuery(
                Store,
                graphql`
                  query ParkAndRide_hub_Query($ids: [String!]!) {
                    carParks(ids: $ids) {
                      name
                      maxCapacity
                      spacesAvailable
                      realtime
                    }
                  }
                `,
                {
                  ids: JSON.parse(feature.properties.facilityIds).map(id =>
                    id.toString(),
                  ),
                },
              ).then(data => {
                const result = data.carParks.filter(
                  park => park != null && park.name != null,
                );
                if (!isEmpty(result)) {
                  feature.properties.facilities = result;
                  [[feature.geom]] = feature.loadGeometry();
                  this.features.push(pick(feature, ['geom', 'properties']));
                  drawParkAndRideIcon(
                    this.tile,
                    feature.geom,
                    this.width,
                    this.height,
                  );
                }
              });
            }
          } else if (
            this.tile.coords.z >= showFacilities &&
            vt.layers.facilities != null
          ) {
            for (
              let i = 0, ref = vt.layers.facilities.length - 1;
              i <= ref;
              i++
            ) {
              const feature = vt.layers.facilities.feature(i);
              fetchQuery(
                Store,
                graphql`
                  query ParkAndRide_facility_Query($id: String!) {
                    carPark(id: $id) {
                      name
                      maxCapacity
                      spacesAvailable
                      realtime
                    }
                  }
                `,
                { id: feature.id.toString() },
              ).then(data => {
                const result = data.carPark;
                if (result != null && result.name != null) {
                  feature.properties.facility = result;
                  feature.geom = new Contour(
                    feature.loadGeometry()[0],
                  ).centroid();
                  this.features.push(feature);
                  drawParkAndRideIcon(
                    this.tile,
                    feature.geom,
                    this.width,
                    this.height,
                  );
                }
              });
            }
          }
        },
        err => console.log(err),
      );
    });
  }
}
