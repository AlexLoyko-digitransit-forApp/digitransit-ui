import PropTypes from 'prop-types';
import React from 'react';
import Relay from 'react-relay/classic';
import moment from 'moment';
import _ from 'lodash';
import { FormattedMessage } from 'react-intl';
import inside from 'point-in-polygon';
import ExternalLink from './ExternalLink';
import SummaryRow from './SummaryRow';
import Icon from './Icon';

function createSummaryRowEntry(itinerary, i) {
  return {
    i,
    itinerary,
  };
}

function ItinerarySummaryListContainer(props, context) {
  if (props.itineraries && props.itineraries.length > 0) {
    const open = props.open && Number(props.open);

    const uniqueSummaries = {};
    let counter = 0;

    // check if has at least one transit leg and get a route by route sequence per this itinerary
    props.itineraries.forEach((itinerary, i) => {
      let noTransitLegs = true;
      let firstTransitLegIndex;
      /*
        here it's making an actual 'route sequence'
        i.e: Walk, take the B, take the R, Walk will look like
        ['WALK', 'B', 'R', 'WALK']
       */
      const currRoutes = itinerary.legs.map((leg, j) => {
        if (leg.transitLeg) {
            noTransitLegs = false;
            firstTransitLegIndex = j;
        }
        if (leg.route && leg.route.shortName) {
          return leg.route.shortName;
        }
        return leg.mode;
      });

      // we are interested in having unique only summary rows with elegant handling of future available routes
      let found = false;

      // iterate over every field of uniqueSummaries and check if itinerary with same 'route sequence' already saved
      for (var property in uniqueSummaries) {
        if (uniqueSummaries.hasOwnProperty(property)) {

          // once found a matching saved itinerary, if time is reasonable, add it to object's futureTimes
          if (_.isEqual(uniqueSummaries[property], currRoutes)) {
            found = true;
            let originalEntry = uniqueSummaries[property];

            // DO NOT add a scheduled next trip if having a realtime approximation for the current -> leads to inaccuracy
            if (originalEntry.itinerary.itinerary.legs[originalEntry.firstTransitLegIndex].realTime && !itinerary.legs[firstTransitLegIndex].realTime) {
              continue;
            }
            if (!originalEntry.futureTimes) {
              originalEntry.futureTimes = [];
            }
            uniqueSummaries[property].futureTimes = [...uniqueSummaries[property].futureTimes, `${moment(itinerary.legs[firstTransitLegIndex].startTime).format('hh:mm a')}`];
          }
        }
      }

      // if not such itinerary is found, create a traditional entry for it
      if (!found) {
        counter += 1;
        uniqueSummaries[counter] = [...currRoutes];
        uniqueSummaries[counter].firstTransitLegIndex = firstTransitLegIndex;
        uniqueSummaries[counter].itinerary = createSummaryRowEntry(itinerary, i);
      }
    });

    // every object in unique summaries is a separate itinerary
    const summaries = [];
    for (var property in uniqueSummaries) {
        if (uniqueSummaries.hasOwnProperty(property)) {
           let i = uniqueSummaries[property].itinerary.i;
           let itinerary = uniqueSummaries[property].itinerary.itinerary;
           summaries.push(
             <SummaryRow
                 refTime={props.searchTime}
                 key={i} // eslint-disable-line react/no-array-index-key
                 hash={i}
                 data={itinerary}
                 passive={i !== props.activeIndex}
                 currentTime={props.currentTime}
                 onSelect={props.onSelect}
                 onSelectImmediately={props.onSelectImmediately}
                 intermediatePlaces={props.relay.route.params.intermediatePlaces}
                 futureTimes = {uniqueSummaries[property].futureTimes}
             >
               {i === open && props.children}
             </SummaryRow>
           );
        }
    }
    return (
      <div className="summary-list-container momentum-scroll">{summaries}</div>
    );
  }
  const { from, to } = props.relay.route.params;
  if (!from.lat || !from.lon || !to.lat || !to.lon) {
    return (
      <div className="summary-list-container summary-no-route-found">
        <FormattedMessage
          id="no-route-start-end"
          defaultMessage="Please select origin and destination."
        />
      </div>
    );
  }

  let msg;
  let outside;
  if (!inside([from.lon, from.lat], context.config.areaPolygon)) {
    msg = 'origin-outside-service';
    outside = true;
  } else if (!inside([to.lon, to.lat], context.config.areaPolygon)) {
    msg = 'destination-outside-service';
    outside = true;
  } else {
    msg = 'no-route-msg';
  }
  let linkPart = null;
  if (outside && context.config.nationalServiceLink) {
    linkPart = (
      <div>
        <FormattedMessage
          id="use-national-service"
          defaultMessage="You can also try the national service available at"
        />
        <ExternalLink
          className="external-no-route"
          {...context.config.nationalServiceLink}
        />
      </div>
    );
  }

  return (
    <div className="summary-list-container summary-no-route-found">
      <div className="flex-horizontal">
        <Icon className="no-route-icon" img="icon-icon_caution" />
        <div>
          <FormattedMessage
            id={msg}
            defaultMessage={
              'Unfortunately no routes were found for your journey. ' +
              'Please change your origin or destination address.'
            }
          />
          {linkPart}
        </div>
      </div>
    </div>
  );
}

ItinerarySummaryListContainer.propTypes = {
  searchTime: PropTypes.number.isRequired,
  itineraries: PropTypes.array,
  activeIndex: PropTypes.number.isRequired,
  currentTime: PropTypes.number.isRequired,
  onSelect: PropTypes.func.isRequired,
  onSelectImmediately: PropTypes.func.isRequired,
  open: PropTypes.number,
  children: PropTypes.node,
  relay: PropTypes.shape({
    route: PropTypes.shape({
      params: PropTypes.shape({
        to: PropTypes.shape({
          lat: PropTypes.number,
          lon: PropTypes.number,
          address: PropTypes.string.isRequired,
        }).isRequired,
        from: PropTypes.shape({
          lat: PropTypes.number,
          lon: PropTypes.number,
          address: PropTypes.string.isRequired,
        }).isRequired,
        intermediatePlaces: PropTypes.array,
      }).isRequired,
    }).isRequired,
  }).isRequired,
};

ItinerarySummaryListContainer.contextTypes = {
  config: PropTypes.object.isRequired,
};

export default Relay.createContainer(ItinerarySummaryListContainer, {
  fragments: {
    itineraries: () => Relay.QL`
      fragment on Itinerary @relay(plural:true){
        walkDistance
        startTime
        endTime
        legs {
          realTime
          transitLeg
          startTime
          endTime
          mode
          distance
          duration
          rentedBike
          intermediatePlace
          route {
            mode
            shortName
            color
            agency {
              name
            }
          }
          trip {
            stoptimes {
              stop {
                gtfsId
              }
              pickupType
            }
          }
          from {
            name
            lat
            lon
            stop {
              gtfsId
            }
          }
          to {
            stop {
              gtfsId
            }
          }
        }
      }
    `,
  },
});
