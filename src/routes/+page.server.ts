import { env } from '$env/dynamic/private';
import https from 'https';
import { Agent, setGlobalDispatcher } from 'undici';
import type { PageServerLoad } from './$types';

const agent = new Agent({
	connect: {
		rejectUnauthorized: false
	}
});

setGlobalDispatcher(agent);

type ProductionJson = {
	production?: Array<{ type?: string; wNow?: number; whToday?: number; whLastSevenDays?: number }>;
	consumption?: Array<{ type?: string; wNow?: number; whToday?: number; whLastSevenDays?: number }>;
};

type Inverter = {
	serialNumber?: string;
	lastReportWatts?: number;
	lastReportDate?: number;
	maxReportWatts?: number;
	whLifetime?: number;
};
type MeterChannel = {
	agg_p_mw?: number;
	agg_s_mva?: number;
	agg_p_ph_a_mw?: number;
	agg_p_ph_b_mw?: number;
	agg_p_ph_c_mw?: number;
	agg_s_ph_a_mva?: number;
	agg_s_ph_b_mva?: number;
	agg_s_ph_c_mva?: number;
};

type LiveData = {
	connection?: {
		mqtt_state?: string;
		prov_state?: string;
		auth_state?: string;
		sc_stream?: string;
		sc_debug?: string;
	};
	meters?: {
		last_update?: number;
		soc?: number;
		main_relay_state?: number;
		gen_relay_state?: number;
		backup_bat_mode?: number;
		backup_soc?: number;
		is_split_phase?: number;
		phase_count?: number;
		enc_agg_soc?: number;
		enc_agg_energy?: number;
		acb_agg_soc?: number;
		acb_agg_energy?: number;
		pv?: MeterChannel;
		grid?: MeterChannel;
		load?: MeterChannel;
		storage?: MeterChannel;
		generator?: MeterChannel;
	};
	tasks?: {
		task_id?: number;
		timestamp?: number;
	};
	counters?: Record<string, number>;
	dry_contacts?: Record<
		string,
		{
			dry_contact_id?: string;
			dry_contact_type?: string;
			dry_contact_load_name?: string;
			dry_contact_status?: number;
		}
	>;
};

type PdmEnergy = {
	production?: {
		eim?: {
			wattHoursToday?: number;
		};
	};
	consumption?: {
		eim?: {
			wattHoursToday?: number;
		};
	};
};

const toNumber = (value: unknown, fallbackValue: number) => {
	const parsed = Number(value);
	return Number.isFinite(parsed) ? parsed : fallbackValue;
};

const toString = (value: unknown, fallbackValue: string) =>
	typeof value === 'string' && value.trim().length > 0 ? value : fallbackValue;

const mphFromMs = (value: number) => value * 2.23694;

export const load = (async ({ fetch }) => {
	const fetchedAt = new Date().toISOString();
	const ENPHASE_BASE_URL = toString(env.ENPHASE_BASE_URL, 'https://envoy.local');
	const ENPHASE_TOKEN = env.ENPHASE_TOKEN;
	const OPENWEATHER_API_KEY = env.OPENWEATHER_API_KEY;
	const OPENWEATHER_LAT = env.OPENWEATHER_LAT ?? env.LAT;
	const OPENWEATHER_LON = env.OPENWEATHER_LON ?? env.LON;
	const OPENWEATHER_UNITS = env.OPENWEATHER_UNITS ?? 'imperial';

	const fetchJson = async <T>(url: string, init: RequestInit = {}): Promise<T | null> => {
		try {
			const res = await fetch(url, {
				...init
			});
			if (!res.ok) {
				console.error('Request failed', url, res.status);
				return null;
			}
			return (await res.json()) as T;
		} catch (error) {
			console.error('Request error', url, error);
			return null;
		}
	};

	const weather = await (async () => {
		if (!OPENWEATHER_API_KEY || !OPENWEATHER_LAT || !OPENWEATHER_LON) return null;
		const weatherUrl = `https://api.openweathermap.org/data/2.5/weather?lat=${OPENWEATHER_LAT}&lon=${OPENWEATHER_LON}&appid=${OPENWEATHER_API_KEY}&units=${OPENWEATHER_UNITS}`;
		const data = await fetchJson<any>(weatherUrl);
		if (!data) return null;

		const temperature = toNumber(data.main?.temp, 37);
		const rain = toNumber(data.rain?.['1h'], 0);
		const clouds = toNumber(data.clouds?.all, 0);
		const windSpeed = toNumber(data.wind?.speed, 0);
		const wind =
			OPENWEATHER_UNITS === 'imperial' ? windSpeed : Number.isFinite(windSpeed) ? mphFromMs(windSpeed) : windSpeed;
		const description = toString(data.weather?.[0]?.description, 'Current conditions');
		const icon = toString(data.weather?.[0]?.icon, '01d');
		return {
			temperature,
			rain,
			clouds,
			wind: Number.isFinite(wind) ? Number(wind.toFixed(1)) : wind,
			description,
			icon,
			lastUpdated: fetchedAt
		};
	})();

	const solar = await (async () => {
		if (!ENPHASE_TOKEN) return null;

		const headers = {
			Authorization: `Bearer ${ENPHASE_TOKEN}`,
			'Content-Type': 'application/json'
		};

		// Newer production endpoint
		const production = await fetchJson<ProductionJson>(`${ENPHASE_BASE_URL}/production.json`, { headers });
		// Inverter detail endpoint (fallback/extra detail)
		const inverters = await fetchJson<Inverter[]>(`${ENPHASE_BASE_URL}/api/v1/production/inverters`, { headers });
		// Live data for instantaneous power
		const livedata = await fetchJson<LiveData>(`${ENPHASE_BASE_URL}/ivp/livedata/status`, { headers });
		// PDM energy for daily production/consumption
		const pdmEnergy = await fetchJson<PdmEnergy>(`${ENPHASE_BASE_URL}/ivp/pdm/energy`, { headers });

		const productionNow = production?.production?.find((p) => p.type === 'site')?.wNow ?? null;
		const consumptionTotal = production?.consumption?.find((c) => c.type === 'total-consumption')?.wNow ?? null;
		const net = production?.consumption?.find((c) => c.type === 'net-consumption')?.wNow ?? null;

		const inverterWatts =
			inverters && inverters.length > 0
				? inverters.map((i) => toNumber(i.lastReportWatts, 0)).reduce((sum, watts) => sum + watts, 0)
				: null;
		const producingKw =
			productionNow !== null ? productionNow / 1000 : inverterWatts !== null ? inverterWatts / 1000 : null;

		const consumingKw = consumptionTotal !== null ? consumptionTotal / 1000 : null;
		const importingKw = net !== null && net > 0 ? net / 1000 : 0;
		const exportingKw = net !== null && net < 0 ? Math.abs(net) / 1000 : 0;

		const whTodayProduced =
			production?.production?.find((p) => p.type === 'site')?.whToday ??
			(inverters && inverters.length > 0
				? inverters.map((i) => toNumber(i.whLifetime, 0)).reduce((sum, wh) => sum + wh, 0)
				: null) ??
			null;
		const whTodayConsumed = production?.consumption?.find((c) => c.type === 'total-consumption')?.whToday ?? null;
		const peakWatts =
			inverters && inverters.length > 0
				? inverters.map((i) => toNumber(i.maxReportWatts, 0)).reduce((max, watts) => Math.max(max, watts), 0)
				: null;
		const peakKw = peakWatts !== null ? peakWatts / 1000 : productionNow !== null ? productionNow / 1000 : null;

		const livePvKw =
			typeof livedata?.meters?.pv?.agg_p_mw === 'number' ? livedata.meters.pv.agg_p_mw / 1_000_000 : null;
		const liveGridKw =
			typeof livedata?.meters?.grid?.agg_p_mw === 'number' ? livedata.meters.grid.agg_p_mw / 1_000_000 : null;
		const liveLoadKw =
			typeof livedata?.meters?.load?.agg_p_mw === 'number' ? livedata.meters.load.agg_p_mw / 1_000_000 : null;

		const producedSolarWh = pdmEnergy?.production?.eim?.wattHoursToday ?? null;
		const consumedSolarWh = pdmEnergy?.consumption?.eim?.wattHoursToday ?? null;
		const producedSolarKwh = producedSolarWh !== null ? producedSolarWh / 1000 : null;
		const consumedSolarKwh = consumedSolarWh !== null ? consumedSolarWh / 1000 : null;
		const exportedSolarKwh =
			producedSolarKwh !== null && consumedSolarKwh !== null
				? Math.max(producedSolarKwh - consumedSolarKwh, 0)
				: null;

		const inverterSummaries =
			inverters?.map((inv) => ({
				serialNumber: toString(inv.serialNumber, ''),
				lastReportWatts: toNumber(inv.lastReportWatts, 0),
				maxReportWatts: toNumber(inv.maxReportWatts, 0)
			})) ?? [];

      // WATT HOURS PRODUCED TODAY - ivp/pdm/energy -> production-> eim -> watthourstoday
      // watt hours consumed from solar - ivp/pdm/energy -> consumption -> eim -> watthourstoday
      
		return {
			producing: livePvKw ?? producingKw ?? 0,
			importing: liveGridKw !== null && liveGridKw > 0 ? liveGridKw : importingKw ?? 0,
			consuming: liveLoadKw ?? consumingKw ?? 0,
			exporting: liveGridKw !== null && liveGridKw < 0 ? Math.abs(liveGridKw) : exportingKw ?? 0,
			imported: 0,
			produced: producedSolarKwh ?? (whTodayProduced !== null ? whTodayProduced / 1000 : 0),
			consumed: consumedSolarKwh ?? (whTodayConsumed !== null ? whTodayConsumed / 1000 : 0),
			exported:
				exportedSolarKwh ??
				(producedSolarKwh !== null && consumedSolarKwh !== null
					? Math.max(producedSolarKwh - consumedSolarKwh, 0)
					: whTodayProduced !== null && whTodayConsumed !== null
						? Math.max(whTodayProduced - whTodayConsumed, 0) / 1000
						: 0),
			peak: peakKw ?? 0,
			inverters: inverterSummaries,
			lastUpdated: fetchedAt
		};
	})();

	return {
		weather,
		solar,
		lastUpdated: fetchedAt
	};
}) satisfies PageServerLoad;
