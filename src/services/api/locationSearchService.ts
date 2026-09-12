export interface PlaceSuggestion {
  placeId: string;
  name: string;
  displayName: string;
  street: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
  latitude: number;
  longitude: number;
  source?: string;
}

export const locationSearchService = {
  /**
   * Extracts latitude, longitude, and place name from Google Maps iframe embed code,
   * Google Maps share link, or @coord URLs
   */
  parseGoogleMapsLocation(input: string): {
    latitude: number;
    longitude: number;
    name?: string;
    source: string;
  } | null {
    if (!input || typeof input !== 'string') return null;
    const str = input.trim();

    // 1. Google Maps embed iframe or pb parameter
    // e.g. <iframe src="https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d3661.507363741884!2d87.53306587501436!3d23.406032601910177...
    const pbLatMatch = str.match(/!3d(-?\d+(?:\.\d+)?)/);
    const pbLngMatch = str.match(/!2d(-?\d+(?:\.\d+)?)/);
    const pbNameMatch = str.match(/!2s([^!&"'>\s]+)/);

    if (pbLatMatch && pbLngMatch) {
      const lat = parseFloat(pbLatMatch[1]);
      const lng = parseFloat(pbLngMatch[1]);
      let name = '';
      if (pbNameMatch) {
        try {
          name = decodeURIComponent(pbNameMatch[1].replace(/\+/g, ' '));
        } catch (e) {
          name = pbNameMatch[1];
        }
      }
      return {
        latitude: lat,
        longitude: lng,
        name: name || undefined,
        source: 'Google Maps iframe / Embed',
      };
    }

    // 2. Google Maps URL with @lat,lng
    // e.g. https://www.google.com/maps/place/KULHAD+CHAI/@23.4060326,87.5330658,17z
    const atMatch = str.match(/@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/);
    if (atMatch) {
      const placeMatch = str.match(/\/place\/([^/@?]+)/);
      let name = '';
      if (placeMatch) {
        try {
          name = decodeURIComponent(placeMatch[1].replace(/\+/g, ' '));
        } catch (e) {
          name = placeMatch[1];
        }
      }
      return {
        latitude: parseFloat(atMatch[1]),
        longitude: parseFloat(atMatch[2]),
        name: name || undefined,
        source: 'Google Maps URL',
      };
    }

    // 3. Google Maps query URL (?q=lat,lng or ?ll=lat,lng)
    const qCoordMatch = str.match(/[?&](?:q|ll|query)=(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/);
    if (qCoordMatch) {
      return {
        latitude: parseFloat(qCoordMatch[1]),
        longitude: parseFloat(qCoordMatch[2]),
        source: 'Google Maps Query',
      };
    }

    // 4. Plain coordinates ("23.4060326, 87.5330658")
    const plainCoordMatch = str.match(/^(-?\d{1,2}(?:\.\d+)?)[,\s]+(-?\d{1,3}(?:\.\d+)?)$/);
    if (plainCoordMatch) {
      const lat = parseFloat(plainCoordMatch[1]);
      const lng = parseFloat(plainCoordMatch[2]);
      if (lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180) {
        return {
          latitude: lat,
          longitude: lng,
          source: 'Direct Coordinates',
        };
      }
    }

    return null;
  },

  /**
   * Searches places, landmarks, and local addresses across India and worldwide
   * Combines high-speed geocoding engines with dedicated India locality prioritization
   */
  async searchPlaces(query: string): Promise<PlaceSuggestion[]> {
    if (!query || query.trim().length < 2) return [];

    // Check if query is an iframe or Google Map URL first
    const parsedIframe = this.parseGoogleMapsLocation(query);
    if (parsedIframe) {
      const rev = await this.reverseGeocode(parsedIframe.latitude, parsedIframe.longitude);
      return [
        {
          placeId: 'iframe-detected',
          name: parsedIframe.name || rev?.name || 'Google Map Location',
          displayName: rev?.displayName || `Lat: ${parsedIframe.latitude.toFixed(6)}, Lng: ${parsedIframe.longitude.toFixed(6)}`,
          street: rev?.street || '',
          city: rev?.city || '',
          state: rev?.state || '',
          postalCode: rev?.postalCode || '',
          country: rev?.country || 'India',
          latitude: parsedIframe.latitude,
          longitude: parsedIframe.longitude,
          source: parsedIframe.source,
        },
      ];
    }

    const q = encodeURIComponent(query.trim());
    const results: PlaceSuggestion[] = [];
    const seen = new Set<string>();

    try {
      // 1. Parallel fetch from Photon and Nominatim with India bias
      const [photonRes, nominatimRes] = await Promise.allSettled([
        fetch(`https://photon.komoot.io/api/?q=${q}&limit=12`),
        fetch(
          `https://nominatim.openstreetmap.org/search?q=${q}&format=json&addressdetails=1&countrycodes=in&limit=12`,
          {
            headers: {
              'User-Agent': 'RestrozPOS/1.0',
              'Accept-Language': 'en-IN,en;q=0.9',
            },
          }
        ),
      ]);

      // Parse Photon results
      if (photonRes.status === 'fulfilled' && photonRes.value.ok) {
        try {
          const data = await photonRes.value.json();
          (data.features || []).forEach((f: any) => {
            const p = f.properties || {};
            if (p.countrycode && p.countrycode.toUpperCase() !== 'IN' && !query.toLowerCase().includes(p.countrycode.toLowerCase())) {
              return;
            }

            const lat = f.geometry?.coordinates?.[1];
            const lon = f.geometry?.coordinates?.[0];
            if (!lat || !lon) return;

            const key = `${lat.toFixed(4)},${lon.toFixed(4)}`;
            if (seen.has(key)) return;
            seen.add(key);

            const street = [p.housenumber, p.street || p.name].filter(Boolean).join(' ');
            const city = p.city || p.district || p.county || p.town || '';
            const state = p.state || '';
            const pin = p.postcode || '';

            results.push({
              placeId: `photon-${p.osm_id || Math.random()}`,
              name: p.name || street || query,
              displayName: [p.name, p.street, p.district, p.city, p.state, p.postcode, p.country || 'India']
                .filter(Boolean)
                .join(', '),
              street: p.street || p.name || '',
              city: city,
              state: state,
              postalCode: pin,
              country: p.country || 'India',
              latitude: lat,
              longitude: lon,
              source: 'Google Map & Places',
            });
          });
        } catch (parseEx) {
          console.warn('Photon parse warning:', parseEx);
        }
      }

      // Parse Nominatim results
      if (nominatimRes.status === 'fulfilled' && nominatimRes.value.ok) {
        try {
          const data = await nominatimRes.value.json();
          (data || []).forEach((item: any) => {
            const lat = parseFloat(item.lat);
            const lon = parseFloat(item.lon);
            if (!lat || !lon) return;

            const key = `${lat.toFixed(4)},${lon.toFixed(4)}`;
            if (seen.has(key)) return;
            seen.add(key);

            const addr = item.address || {};
            const streetParts = [
              addr.building || addr.amenity || addr.shop,
              addr.house_number,
              addr.road || addr.pedestrian || addr.suburb || addr.neighbourhood,
            ].filter(Boolean);

            const street =
              streetParts.length > 0
                ? streetParts.join(', ')
                : item.name || item.display_name.split(',')[0];

            const city =
              addr.city ||
              addr.town ||
              addr.village ||
              addr.municipality ||
              addr.city_district ||
              addr.county ||
              addr.state_district ||
              '';

            const state = addr.state || addr.state_district || '';
            const pin = addr.postcode || '';

            results.push({
              placeId: `nom-${item.place_id || Math.random()}`,
              name: item.name || item.display_name.split(',')[0] || query,
              displayName: item.display_name,
              street: street,
              city: city,
              state: state,
              postalCode: pin,
              country: addr.country || 'India',
              latitude: lat,
              longitude: lon,
              source: 'Google Map & Places',
            });
          });
        } catch (parseEx) {
          console.warn('Nominatim parse warning:', parseEx);
        }
      }

      return results;
    } catch (e) {
      console.warn('locationSearchService.searchPlaces error:', e);
      return [];
    }
  },

  /**
   * Reverse geocodes coordinates to street address, city, state and PIN in India
   */
  async reverseGeocode(lat: number, lon: number): Promise<Partial<PlaceSuggestion> | null> {
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=json&addressdetails=1`,
        {
          headers: {
            'User-Agent': 'RestrozPOS/1.0',
            'Accept-Language': 'en-IN,en;q=0.9',
          },
        }
      );
      if (!res.ok) return null;
      const data = await res.json();
      const addr = data.address || {};

      const streetParts = [
        addr.building || addr.amenity || addr.shop,
        addr.house_number,
        addr.road || addr.pedestrian || addr.suburb,
      ].filter(Boolean);

      return {
        name: data.name || data.display_name?.split(',')[0],
        displayName: data.display_name,
        street: streetParts.join(', ') || addr.road || data.display_name?.split(',')[0],
        city: addr.city || addr.town || addr.village || addr.municipality || addr.state_district || '',
        state: addr.state || '',
        postalCode: addr.postcode || '',
        country: addr.country || 'India',
        latitude: lat,
        longitude: lon,
      };
    } catch (e) {
      console.warn('locationSearchService.reverseGeocode error:', e);
      return null;
    }
  },
};
