import { useRef, useEffect } from 'react';
import { createChart, IChartApi, ISeriesApi, CandlestickSeries, HistogramSeries } from 'lightweight-charts';
import { TimeFrame, CandlestickDataWithVolume } from '../types/chart';
import { formatChartNumber, formatChartDate, prepareVolumeData } from '../utils/formatters';
import { THEME } from '../constants/colors';

export interface ChartHookResult {
  chartContainerRef: React.RefObject<HTMLDivElement | null>;
}

const CHART_OPTIONS = {
  layout: {
    background: { color: THEME.background.secondary.hex },
    textColor: THEME.text.primary.hex,
  },
  grid: {
    vertLines: { color: THEME.chart.grid },
    horzLines: { color: THEME.chart.grid },
  },
  crosshair: {
    mode: 1,
  },
  rightPriceScale: {
    borderColor: THEME.chart.border,
  },
  timeScale: {
    borderColor: THEME.chart.border,
  },
};

const TOOLTIP_STYLES = {
  width: '200px',
  height: 'auto',
  position: 'absolute',
  display: 'none',
  padding: '8px',
  boxSizing: 'border-box',
  fontSize: '12px',
  color: THEME.text.primary.hex,
  backgroundColor: THEME.background.tooltip.hex,
  border: `1px solid ${THEME.chart.border}`,
  borderRadius: '4px',
  pointerEvents: 'none',
  fontFamily: 'monospace',
  zIndex: '1000'
} as const;

function createTooltipElement(container: HTMLDivElement): HTMLDivElement {
  const tooltip = document.createElement('div');
  Object.assign(tooltip.style, TOOLTIP_STYLES);
  container.appendChild(tooltip);
  return tooltip;
}

function createTooltipContent(data: CandlestickDataWithVolume, dateStr: string, volume?: number): string {
  return `
    <div style="margin-bottom: 4px; font-weight: bold;">${dateStr}</div>
    <div style="color: ${THEME.text.secondary.hex};">O: <span style="color: ${THEME.text.primary.hex};">$${formatChartNumber(data.open)}</span></div>
    <div style="color: ${THEME.text.secondary.hex};">H: <span style="color: ${THEME.text.primary.hex};">$${formatChartNumber(data.high)}</span></div>
    <div style="color: ${THEME.text.secondary.hex};">L: <span style="color: ${THEME.text.primary.hex};">$${formatChartNumber(data.low)}</span></div>
    <div style="color: ${THEME.text.secondary.hex};">C: <span style="color: ${THEME.text.primary.hex};">$${formatChartNumber(data.close)}</span></div>
    ${volume ? `<div style="color: ${THEME.text.secondary.hex};">V: <span style="color: ${THEME.text.primary.hex};">${formatChartNumber(volume)}</span></div>` : ''}
  `;
}

function calculateTooltipPosition(
  mouseX: number,
  mouseY: number,
  tooltipWidth: number,
  tooltipHeight: number,
  containerWidth: number,
  containerHeight: number
): { left: number; top: number } {
  let left = mouseX + 10;
  let top = mouseY - 10;

  if (left + tooltipWidth > containerWidth) {
    left = mouseX - tooltipWidth - 10;
  }
  if (top + tooltipHeight > containerHeight) {
    top = mouseY - tooltipHeight - 10;
  }
  if (left < 0) left = 10;
  if (top < 0) top = 10;

  return { left, top };
}

export const useChart = (data: CandlestickDataWithVolume[], timeFrame: TimeFrame): ChartHookResult => {
  const chartContainerRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candlestickSeriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null);
  const volumeSeriesRef = useRef<ISeriesApi<'Histogram'> | null>(null);
  const tooltipRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!chartContainerRef.current) return;

    const cleanup = () => {
      if (chartRef.current) {
        chartRef.current.remove();
        chartRef.current = null;
        candlestickSeriesRef.current = null;
        volumeSeriesRef.current = null;
      }
      if (tooltipRef.current) {
        tooltipRef.current.remove();
        tooltipRef.current = null;
      }
    };

    cleanup();

    tooltipRef.current = createTooltipElement(chartContainerRef.current);

    const chart = createChart(chartContainerRef.current, {
      ...CHART_OPTIONS,
      width: chartContainerRef.current.clientWidth,
      height: chartContainerRef.current.clientHeight,
      handleScroll: {
        mouseWheel: true,
        pressedMouseMove: true,
        horzTouchDrag: true,
        vertTouchDrag: true,
      },
      handleScale: {
        axisPressedMouseMove: { time: true, price: true },
        axisDoubleClickReset: { time: true, price: true },
        mouseWheel: true,
        pinch: true,
      },
      timeScale: {
        ...CHART_OPTIONS.timeScale,
        timeVisible: true,
        secondsVisible: timeFrame === '1m',
      },
      crosshair: {
        mode: 1,
        vertLine: {
          width: 1,
          color: THEME.chart.crosshair,
          style: 2,
        },
        horzLine: {
          width: 1,
          color: THEME.chart.crosshair,
          style: 2,
        },
      },
    });

    const candlestickSeries = chart.addSeries(CandlestickSeries, {
      upColor: THEME.action.buy.hex,
      downColor: THEME.action.sell.hex,
      borderVisible: false,
      wickUpColor: THEME.action.buy.hex,
      wickDownColor: THEME.action.sell.hex,
      priceScaleId: 'right',
    });

    const volumeSeries = chart.addSeries(HistogramSeries, {
      color: THEME.chart.grid,
      priceFormat: { type: 'volume' },
      priceScaleId: 'volume',
    });

    chart.priceScale('volume').applyOptions({
      scaleMargins: { top: 0.7, bottom: 0 },
    });

    chartRef.current = chart;
    candlestickSeriesRef.current = candlestickSeries;
    volumeSeriesRef.current = volumeSeries;

    if (data.length > 0) {
      candlestickSeries.setData(data);
      const volumeData = prepareVolumeData(data);
      if (volumeData.length > 0) {
        volumeSeries.setData(volumeData);
      }
    }

    chart.subscribeCrosshairMove(param => {
      if (!param.point || !param.time || !tooltipRef.current) {
        if (tooltipRef.current) {
          tooltipRef.current.style.display = 'none';
        }
        return;
      }

      const candlePrice = param.seriesData.get(candlestickSeries);
      if (!candlePrice || !chartContainerRef.current) {
        tooltipRef.current.style.display = 'none';
        return;
      }

      const candleData = candlePrice as CandlestickDataWithVolume;
      const dateStr = formatChartDate(param.time as number);
      const originalData = data.find(item => item.time === param.time);
      
      tooltipRef.current.style.display = 'block';
      tooltipRef.current.innerHTML = createTooltipContent(candleData, dateStr, originalData?.volume);

      const { left, top } = calculateTooltipPosition(
        param.point.x,
        param.point.y,
        tooltipRef.current.offsetWidth,
        tooltipRef.current.offsetHeight,
        chartContainerRef.current.clientWidth,
        chartContainerRef.current.clientHeight
      );

      tooltipRef.current.style.left = `${left}px`;
      tooltipRef.current.style.top = `${top}px`;
    });

    const handleResize = () => {
      if (chartContainerRef.current && chartRef.current) {
        chartRef.current.applyOptions({
          width: chartContainerRef.current.clientWidth,
          height: chartContainerRef.current.clientHeight,
        });
      }
    };

    window.addEventListener('resize', handleResize);
    handleResize();

    return () => {
      window.removeEventListener('resize', handleResize);
      cleanup();
    };
  }, [timeFrame]);

  useEffect(() => {
    if (candlestickSeriesRef.current && data.length > 0) {
      candlestickSeriesRef.current.setData(data);
      
      if (volumeSeriesRef.current) {
        const volumeData = prepareVolumeData(data);
        if (volumeData.length > 0) {
          volumeSeriesRef.current.setData(volumeData);
        }
      }
    }
  }, [data]);

  return { chartContainerRef };
};