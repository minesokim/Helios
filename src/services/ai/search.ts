const TAVILY_API_KEY = process.env.TAVILY_API_KEY

export interface SearchResult {
  title: string
  content: string
  url: string
}

export interface SearchResponse {
  answer?: string
  results: SearchResult[]
}

/**
 * Perform a web search using Tavily API
 */
export async function webSearch(query: string): Promise<string> {
  if (!TAVILY_API_KEY) {
    return 'Web search is not configured. Please set TAVILY_API_KEY.'
  }

  try {
    const response = await fetch('https://api.tavily.com/search', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        api_key: TAVILY_API_KEY,
        query,
        search_depth: 'basic',
        include_answer: true,
        include_raw_content: false,
        max_results: 5,
      }),
    })

    if (!response.ok) {
      return `Search failed with status ${response.status}`
    }

    const data = await response.json() as {
      answer?: string
      results?: Array<{ title?: string; content?: string; url?: string }>
    }

    // Format results
    const results: string[] = []

    if (data.answer) {
      results.push(`Summary: ${data.answer}`)
    }

    for (const result of (data.results || []).slice(0, 5)) {
      const title = result.title || ''
      const content = (result.content || '').slice(0, 300)
      results.push(`- ${title}: ${content}`)
    }

    return results.length > 0 ? results.join('\n') : 'No results found.'
  } catch (error) {
    console.error('Web search error:', error)
    return `Search error: ${error instanceof Error ? error.message : 'Unknown error'}`
  }
}
