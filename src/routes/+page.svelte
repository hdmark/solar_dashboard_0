<script lang="ts">
  import { page } from "$app/stores";
  import { invalidateAll } from "$app/navigation";
  import { onMount } from "svelte";
  import { ArrowDown, ArrowUp, Home, MoonStar, RefreshCw, Sun, Zap } from "@lucide/svelte";

  const fallback = {
    weather: {
      temperature: 0,
      rain: 0,
      clouds: 0,
      wind: 0,
      lastUpdated: "00:00:00",
      description: "Rain: 0% | Clouds: 0% | Wind: 6 mph",
      icon: "01d"
    },
    flows: {
      producing: 0,
      importing: 0,
      consuming: 0,
      exporting: 0
    },
    daily: {
      imported: 0,
      produced: 0,
      consumed: 0,
      exported: 0,
      peak: 0
    },
    lastUpdated: "00:00:00"
  };

  const toNumber = (value: unknown, fallbackValue: number) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallbackValue;
  };

  const toStringValue = (value: unknown, fallbackValue: string) => {
    return typeof value === "string" && value.trim().length > 0 ? value : fallbackValue;
  };

  let now = new Date();
  let weather = fallback.weather;
  let flows = fallback.flows;
  let daily = fallback.daily;
  let lastUpdatedSolar = fallback.lastUpdated;
  let inverters: { serialNumber?: string; lastReportWatts?: number; maxReportWatts?: number }[] = [];

  onMount(() => {
    const timer = setInterval(() => {
      now = new Date();
    }, 1000);

    return () => clearInterval(timer);
  });

  const formatTime = (date: Date) =>
    date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit", second: "2-digit" });

  const formatDate = (date: Date) =>
    date.toLocaleDateString([], { weekday: "long", month: "long", day: "numeric" });

  const formatEnergy = (value: number) => value.toFixed(1);
  const formatPower = (value?: number) => {
    if (value === undefined || value === null) return "--";
    return `${(value / 1000).toFixed(1)} kW`;
  };

  const formatLastUpdated = (value: string) => {
    const parsed = Date.parse(value);
    if (!Number.isNaN(parsed)) {
      return new Date(parsed).toLocaleTimeString([], {
        hour: "numeric",
        minute: "2-digit",
        second: "2-digit"
      });
    }
    return value;
  };

  const iconUrl = (icon: string) => `https://openweathermap.org/img/wn/${icon}@2x.png`;

  const REFRESH_INTERVAL = 15 * 60 * 1000; // 15 minutes
  let refreshing = false;

  const refresh = async () => {
    refreshing = true;
    try {
      await invalidateAll();
    } finally {
      refreshing = false;
    }
  };

  onMount(() => {
    const interval = setInterval(() => {
      refresh();
    }, REFRESH_INTERVAL);

    return () => clearInterval(interval);
  });

  $: data = $page.data ?? {};
  $: solarSource = data?.solar ?? {};
  $: weatherSource = data?.weather ?? {};
  $: inverters = Array.isArray(data?.solar?.inverters) ? data.solar.inverters : [];

  $: {
    const temperature = toNumber(weatherSource.temperature, fallback.weather.temperature);
    const rain = toNumber(weatherSource.rain, fallback.weather.rain);
    const clouds = toNumber(weatherSource.clouds, fallback.weather.clouds);
    const wind = toNumber(weatherSource.wind, fallback.weather.wind);
    const updated = toStringValue(weatherSource.lastUpdated ?? data.lastUpdated, fallback.weather.lastUpdated);

    weather = {
      temperature,
      rain,
      clouds,
      wind,
      icon: toStringValue(weatherSource.icon, fallback.weather.icon),
      lastUpdated: formatLastUpdated(updated),
      description: toStringValue(
        weatherSource.description,
        `Rain: ${rain}% | Clouds: ${clouds}% | Wind: ${wind} mph`
      )
    };
  }

  $: flows = {
    producing: toNumber(solarSource.producing, fallback.flows.producing),
    importing: toNumber(solarSource.importing, fallback.flows.importing),
    consuming: toNumber(solarSource.consuming, fallback.flows.consuming),
    exporting: toNumber(solarSource.exporting, fallback.flows.exporting)
  };

  $: daily = {
    imported: 0,
    produced: toNumber(solarSource.produced, fallback.daily.produced),
    consumed: toNumber(solarSource.consumed, fallback.daily.consumed),
    exported: toNumber(solarSource.exported, fallback.daily.exported),
    peak: 0
  };

  $: lastUpdatedSolar = formatLastUpdated(
    toStringValue(solarSource.lastUpdated ?? data.lastUpdated ?? fallback.lastUpdated, fallback.lastUpdated)
  );

  $: dailyItems = [
    { label: "Produced (Solar)", value: `${formatEnergy(daily.produced)} kWh` },
    { label: "Consumed (Solar)", value: `${formatEnergy(daily.consumed)} kWh` },
    { label: "Exported", value: `${formatEnergy(daily.exported)} kWh` }
  ];
</script>

<svelte:head>
  <title>Solar Dashboard</title>
</svelte:head>

<div class="relative isolate min-h-screen w-full overflow-hidden bg-gradient-to-br from-[#0b1021] via-[#0f1a30] to-[#0a0f1f] text-slate-100">
  <div class="pointer-events-none absolute inset-x-10 top-10 h-24 rounded-full bg-gradient-to-r from-sky-500/20 via-purple-500/15 to-amber-400/20 blur-3xl"></div>
  <div class="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(255,255,255,0.05),transparent_35%)]"></div>

  <main class="relative mx-auto flex max-w-[1280px] flex-col gap-6 px-6 py-6 sm:px-10">

    <section class="grid grid-cols-1 gap-4 md:grid-cols-2">
      <article class="group rounded-3xl border border-white/10 bg-gradient-to-br from-white/10 via-white/5 to-white/0 px-6 py-5 shadow-2xl shadow-black/50 backdrop-blur">
        <div class="flex items-center gap-4">
          <div class="flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-700/60 to-slate-900/80 border border-white/10 shadow-inner shadow-black/60">
            <img
              src={iconUrl(weather.icon)}
              alt={weather.description}
              class="h-12 w-12 drop-shadow-[0_5px_12px_rgba(0,0,0,0.35)]"
              loading="lazy"
              decoding="async"
            />
          </div>
          <div class="space-y-1">
            <p class="text-4xl font-semibold leading-tight tracking-tight">{weather.temperature}°F</p>
            <p class="text-sm text-slate-300">{weather.description}</p>
            <p class="text-xs text-slate-400">Last Updated: {weather.lastUpdated}</p>
          </div>
        </div>
      </article>

      <article class="rounded-3xl border border-white/10 bg-gradient-to-br from-white/10 via-white/5 to-white/0 px-6 py-5 text-right shadow-2xl shadow-black/50 backdrop-blur">
        <p class="text-4xl font-semibold leading-tight tracking-tight">{formatTime(now)}</p>
        <p class="text-sm text-slate-300">{formatDate(now)}</p>
      </article>
    </section>

    <section class="rounded-3xl border border-white/10 bg-gradient-to-br from-white/5 via-white/2 to-white/0 p-6 shadow-[0_20px_80px_rgba(0,0,0,0.55)] backdrop-blur">

      <div class="mt-6 grid grid-cols-1 gap-6 xl:grid-cols-[1fr_1.2fr_0.9fr]">
        <div class="inverters-panel rounded-3xl border border-white/10 bg-slate-900/50 p-4 shadow-lg shadow-black/40">
          <div class="mb-3 flex items-center justify-between">
            <p class="text-sm uppercase tracking-[0.22em] text-slate-400">Inverters</p>
          </div>
          <div class="grid grid-cols-2 gap-2">
            {#if inverters.length === 0}
              <div class="rounded-2xl border border-white/5 bg-white/5 px-3 py-4 text-center text-sm text-slate-400">
                No inverter data
              </div>
            {:else}
              {#each inverters.slice(0, 16) as inverter}
                <div class="rounded-2xl border border-white/10 bg-white/5 px-3 py-2 shadow-inner shadow-black/30 text-xs text-slate-100">
                  <div class="flex items-center justify-center text-[11px] text-slate-50 font-semibold">
                    {formatPower(inverter.lastReportWatts)}
                  </div>
                </div>
              {/each}
            {/if}
          </div>
        </div>

        <div class="live-panel flex flex-col items-center gap-4">
          <div class="flex flex-wrap justify-center gap-3">
            <div class="flow-card w-48 rounded-2xl border border-amber-300/20 bg-gradient-to-b from-amber-500/10 to-amber-500/0 px-4 py-3 shadow-lg shadow-amber-900/30">
              <div class="flex items-center justify-between">
                <div class="flex items-center gap-3">
                  <span class="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-500/15 border border-amber-300/30 text-amber-200">
                    <Sun class="h-5 w-5" aria-hidden="true" />
                  </span>
                  <div class="leading-tight">
                    <p class="text-xl font-semibold">{formatEnergy(flows.producing)} kW</p>
                    <p class="text-[11px] uppercase tracking-[0.2em] text-amber-100/80">Producing</p>
                  </div>
                </div>
              </div>
            </div>

            <div class="flow-card w-48 rounded-2xl border border-sky-300/25 bg-gradient-to-b from-sky-500/15 to-sky-500/0 px-4 py-3 shadow-lg shadow-sky-900/30">
              <div class="flex items-center gap-3">
                <span class="flex h-10 w-10 items-center justify-center rounded-xl bg-sky-500/15 border border-sky-300/30 text-sky-100">
                  <Zap class="h-5 w-5" aria-hidden="true" />
                </span>
                <div class="leading-tight">
                  <p class="text-xl font-semibold">{formatEnergy(flows.importing)} kW</p>
                  <p class="text-[11px] uppercase tracking-[0.2em] text-sky-100/80">Importing</p>
                </div>
              </div>
            </div>
          </div>

          <div class="flex flex-col items-center gap-2">
            <div class="flex flex-col items-center gap-1 text-cyan-200">
              <ArrowDown class="h-4 w-4" aria-hidden="true" />
              <div class="h-10 w-[2px] bg-gradient-to-b from-cyan-400/80 via-cyan-300/40 to-transparent"></div>
            </div>

            <div class="w-44 rounded-2xl border border-violet-300/25 bg-gradient-to-b from-violet-500/12 to-violet-500/0 px-4 py-3 text-center shadow-lg shadow-black/40">
              <div class="flex items-center gap-3">
                <span class="flex h-10 w-10 items-center justify-center rounded-xl bg-violet-500/15 border border-violet-300/30 text-rose-200">
                  <Home class="h-5 w-5" aria-hidden="true" />
                </span>
                <div class="leading-tight">
                  <p class="text-xl font-semibold">{formatEnergy(flows.consuming)} kW</p>
                  <p class="text-[11px] uppercase tracking-[0.2em] text-amber-100/80">Consuming</p>
                </div>
                </div>
            </div>

            <div class="flex flex-col items-center gap-1 text-emerald-200">
              <div class="h-8 w-[2px] bg-gradient-to-b from-transparent via-emerald-300/40 to-emerald-400/80"></div>
              <ArrowDown class="h-4 w-4" aria-hidden="true" />
            </div>

            <div class="flow-card w-48 rounded-2xl border border-emerald-300/25 bg-gradient-to-b from-emerald-500/12 to-emerald-500/0 px-4 py-3 text-center shadow-lg shadow-emerald-900/30">
              <div class="flex items-center gap-3">
              <span class="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-500/15 border border-amber-300/30 text-amber-200">
                <Zap class="h-5 w-5" aria-hidden="true" />
              </span>
              <div class="leading-tight">
                <p class="text-xl font-semibold">{formatEnergy(flows.exporting)} kW</p>
                <p class="text-[11px] uppercase tracking-[0.2em] text-amber-100/80">Exporting</p>
              </div>
              </div>
            </div>
          </div>
          <p class="mt-3 text-right text-xs text-slate-500">Last Updated: {lastUpdatedSolar}</p>

        </div>

        <div class="daily-panel rounded-3xl border border-white/10 bg-slate-900/50 p-5 shadow-lg shadow-black/40">
          <div class="mb-3 flex items-center justify-between">
            <p class="text-sm uppercase tracking-[0.22em] text-slate-400">Daily</p>
          </div>
          <div class="grid gap-3">
            {#each dailyItems as item}
              <div class="flex items-center justify-between rounded-2xl border border-white/5 bg-white/5 px-4 py-3 shadow-inner shadow-black/30">
                <span class="text-xs uppercase tracking-[0.2em] text-slate-400">{item.label}</span>
                <span class="text-xl font-semibold text-slate-50">{item.value}</span>
              </div>
            {/each}
          </div>
        </div>
      </div>
    </section>
  </main>

  <button
    class="fixed bottom-6 right-6 flex h-12 items-center gap-2 rounded-full border border-white/10 bg-white/10 px-4 text-sm font-semibold text-slate-50 shadow-lg shadow-black/40 backdrop-blur transition hover:-translate-y-0.5 hover:border-white/20 hover:bg-white/15 active:translate-y-0 disabled:opacity-60"
    on:click={refresh}
    disabled={refreshing}
    aria-live="polite"
  >
    <RefreshCw class={`h-5 w-5 ${refreshing ? "animate-spin" : ""}`} aria-hidden="true" />
    {refreshing ? "Refreshing..." : "Refresh data"}
  </button>
</div>