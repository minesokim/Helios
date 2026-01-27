import { NextResponse } from 'next/server'

// Cache the data for 5 minutes to avoid hitting rate limits
let cachedData: { data: SPDataPoint[]; timestamp: number } | null = null
const CACHE_DURATION = 5 * 60 * 1000 // 5 minutes

interface SPDataPoint {
  date: string
  close: number
}

interface YahooChartResult {
  chart: {
    result: Array<{
      timestamp: number[]
      indicators: {
        quote: Array<{
          close: (number | null)[]
        }>
      }
    }>
  }
}

export async function GET() {
  try {
    // Return cached data if fresh
    if (cachedData && Date.now() - cachedData.timestamp < CACHE_DURATION) {
      return NextResponse.json(cachedData.data)
    }

    // Fetch 3-year data from Yahoo Finance (free, no API key needed)
    // ^GSPC is the S&P 500 ticker symbol
    const threeYearsAgo = Math.floor(Date.now() / 1000) - (3 * 365 * 24 * 60 * 60)
    const now = Math.floor(Date.now() / 1000)

    const url = `https://query1.finance.yahoo.com/v8/finance/chart/%5EGSPC?period1=${threeYearsAgo}&period2=${now}&interval=1wk`

    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
      },
    })

    if (!response.ok) {
      throw new Error(`Yahoo Finance API error: ${response.status}`)
    }

    const json: YahooChartResult = await response.json()
    const result = json.chart.result[0]

    if (!result || !result.timestamp || !result.indicators?.quote?.[0]?.close) {
      throw new Error('Invalid response structure')
    }

    const timestamps = result.timestamp
    const closes = result.indicators.quote[0].close

    // Map to our format, filtering out null values
    const data: SPDataPoint[] = []
    for (let i = 0; i < timestamps.length; i++) {
      const closeValue = closes[i]
      if (closeValue !== null) {
        data.push({
          date: new Date(timestamps[i] * 1000).toISOString().split('T')[0],
          close: Math.round(closeValue * 100) / 100,
        })
      }
    }

    // Cache the result
    cachedData = { data, timestamp: Date.now() }

    return NextResponse.json(data)
  } catch (error) {
    console.error('Failed to fetch S&P 500 data:', error)

    // Return fallback data if API fails
    const fallbackData = generateFallbackData()
    return NextResponse.json(fallbackData)
  }
}

// Generate realistic fallback data if API fails
function generateFallbackData(): SPDataPoint[] {
  const data: SPDataPoint[] = []
  const now = new Date()
  let price = 3800 // Starting price 3 years ago

  for (let i = 156; i >= 0; i--) { // ~3 years of weekly data
    const date = new Date(now)
    date.setDate(date.getDate() - (i * 7))

    // Add some realistic volatility
    const change = (Math.random() - 0.48) * 50 // Slight upward bias
    price = Math.max(3500, Math.min(6500, price + change))

    data.push({
      date: date.toISOString().split('T')[0],
      close: Math.round(price * 100) / 100,
    })
  }

  return data
}
