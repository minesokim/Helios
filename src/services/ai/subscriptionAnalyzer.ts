// subscriptionAnalyzer.ts
// Industry-standard multi-stage subscription detection pipeline

interface Transaction {
  date: string;
  description: string;
  amount: number;
  merchant_name?: string | null;
}

interface TransactionStream {
  merchantNormalized: string;
  transactions: Transaction[];
  amountCluster: number[];
  intervalPattern: number[];
}

interface RecurrenceResult {
  isRecurring: boolean;
  confidence: number;
  cycle?: string;
  predictedNext?: string | null;
  excludedReason?: string;
}

export interface SubscriptionResult {
  merchant: string;
  status: 'mature' | 'early_detection';
  confidence: number;
  cycle: string | null;
  avgAmount: number;
  totalSpent: number;
  transactionCount: number;
  firstSeen: string;
  lastSeen: string;
  predictedNext: string | null;
  estimatedMonthly: number;
}

// Stage 4: Category exclusions and boosts
const CATEGORY_EXCLUSIONS = {
  // Hard exclusions - NEVER subscriptions regardless of pattern
  gas_stations: ['chevron', 'arco', 'shell', 'mobil', 'exxon', '76', 'gas', 'fuel', 'petroleum'],
  groceries: ['costco', 'walmart', 'target', 'safeway', 'albertsons', 'ralphs', 'trader joe', 'h mart', 'whole foods', 'kroger', 'publix', 'aldi', 'grocery', 'vons', 'food 4 less'],
  restaurants: ['starbucks', 'coffee', 'cafe', 'restaurant', 'sushi', 'ramen', 'pizza', 'in-n-out', 'mcdonalds', 'chipotle', 'taco bell', 'wendys', 'burger', 'doordash', 'uber eats', 'grubhub', 'postmates'],
  transfers: ['zelle', 'venmo', 'paypal', 'cash app', 'transfer', 'payment to'],

  // Confidence boosters - LIKELY subscriptions
  streaming: ['netflix', 'spotify', 'hulu', 'disney', 'hbo', 'apple tv', 'youtube', 'amazon prime', 'peacock', 'paramount'],
  software: ['adobe', 'framer', 'figma', 'notion', 'slack', 'github', 'vercel', 'supabase', 'aws', 'google cloud', 'microsoft', 'dropbox', 'icloud', '1password', 'linear'],
  ai_tools: ['openai', 'anthropic', 'claude', 'elevenlabs', 'midjourney', 'runway', 'replicate', 'lovable'],
  fitness: ['gym', 'fitness', 'planet fitness', 'equinox', 'eos', 'la fitness', 'crunch', 'orangetheory', 'peloton'],
  utilities: ['electric', 'water', 'gas bill', 'internet', 'comcast', 'spectrum', 'at&t', 'verizon', 't-mobile'],
  memberships: ['membership', 'subscription', 'premium', 'plus', 'pro plan']
};

// Stage 1: Merchant Normalization (Critical)
function normalizeMerchant(raw: string): string {
  let clean = raw
    .replace(/\d{2}\/\d{2}/g, '')              // Dates: 01/19
    .replace(/#?\d{6,}/g, '')                   // Reference numbers
    .replace(/PURCHASE|MOBILE|CHECKCARD|POS|DEBIT|CARD|ACH|RECURRING|PAYMENT/gi, '')
    .replace(/\s{2,}/g, ' ')
    .trim();

  // Extract core merchant (first 2-3 meaningful tokens)
  const tokens = clean.split(/\s+/).filter(t => t.length > 1);
  return tokens.slice(0, 2).join(' ').toUpperCase();
}

// Helper: Group by key
function groupBy<T>(arr: T[], keyFn: (item: T) => string): Record<string, T[]> {
  return arr.reduce((acc, item) => {
    const key = keyFn(item);
    (acc[key] = acc[key] || []).push(item);
    return acc;
  }, {} as Record<string, T[]>);
}

// Helper: Mean
function mean(arr: number[]): number {
  if (arr.length === 0) return 0;
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}

// Helper: Standard deviation
function standardDeviation(arr: number[]): number {
  if (arr.length < 2) return 0;
  const avg = mean(arr);
  const squareDiffs = arr.map(v => Math.pow(v - avg, 2));
  return Math.sqrt(mean(squareDiffs));
}

// Helper: Compute intervals between transactions
function computeIntervals(txns: Transaction[]): number[] {
  const sorted = [...txns].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  const intervals: number[] = [];

  for (let i = 1; i < sorted.length; i++) {
    const days = (new Date(sorted[i].date).getTime() - new Date(sorted[i - 1].date).getTime()) / 86400000;
    intervals.push(days);
  }
  return intervals;
}

// Stage 2: Cluster by amount within same merchant
function clusterByAmount(txns: Transaction[], tolerance: number): Transaction[][] {
  const clusters: Transaction[][] = [];
  const sorted = [...txns].sort((a, b) => Math.abs(a.amount) - Math.abs(b.amount));

  for (const txn of sorted) {
    const amt = Math.abs(txn.amount);
    const match = clusters.find(c => {
      const baseAmt = Math.abs(c[0].amount);
      if (baseAmt === 0) return amt === 0;
      return Math.abs(amt - baseAmt) / baseAmt <= tolerance;
    });

    if (match) match.push(txn);
    else clusters.push([txn]);
  }

  return clusters;
}

// Stage 2: Stream Clustering
function clusterIntoStreams(txns: Transaction[]): TransactionStream[] {
  // Only analyze expenses
  const expenses = txns.filter(t => t.amount < 0);
  const byMerchant = groupBy(expenses, t => normalizeMerchant(t.merchant_name || t.description));

  const streams: TransactionStream[] = [];

  for (const [merchant, merchantTxns] of Object.entries(byMerchant)) {
    if (merchantTxns.length < 2) continue; // Need at least 2 transactions

    // Cluster by amount within same merchant (20% tolerance)
    const amountClusters = clusterByAmount(merchantTxns, 0.20);

    for (const cluster of amountClusters) {
      if (cluster.length < 2) continue; // Need at least 2 in cluster

      streams.push({
        merchantNormalized: merchant,
        transactions: cluster,
        amountCluster: cluster.map(t => Math.abs(t.amount)),
        intervalPattern: computeIntervals(cluster)
      });
    }
  }

  return streams;
}

// Stage 3: Detect recurrence with fuzzy interval matching
function detectRecurrence(stream: TransactionStream): RecurrenceResult {
  const intervals = stream.intervalPattern;

  if (intervals.length < 1) {
    return { isRecurring: false, confidence: 0 };
  }

  // Billing cycles with fuzzy matching
  const cycles = [
    { name: 'weekly', target: 7, tolerance: 2 },
    { name: 'biweekly', target: 14, tolerance: 3 },
    { name: 'monthly', target: 30, tolerance: 7 },    // Months vary 28-31
    { name: 'quarterly', target: 91, tolerance: 14 },
    { name: 'annual', target: 365, tolerance: 30 }
  ];

  const avgInterval = mean(intervals);
  const stdDev = standardDeviation(intervals);

  for (const cycle of cycles) {
    const withinTarget = Math.abs(avgInterval - cycle.target) <= cycle.tolerance;
    const lowVariance = stdDev <= cycle.tolerance * 1.5;

    if (withinTarget && lowVariance) {
      const confidence = calculateConfidence(intervals, cycle);
      return {
        isRecurring: true,
        cycle: cycle.name,
        confidence,
        predictedNext: predictNextDate(stream.transactions, cycle)
      };
    }
  }

  // Check for custom recurring pattern (consistent but not standard cycle)
  if (intervals.length >= 2 && stdDev < avgInterval * 0.35) {
    return {
      isRecurring: true,
      cycle: 'custom',
      confidence: 50 + Math.max(0, 30 - stdDev),
      predictedNext: null
    };
  }

  return { isRecurring: false, confidence: 0 };
}

// Calculate confidence score
function calculateConfidence(intervals: number[], cycle: { name: string; target: number; tolerance: number }): number {
  const avgInterval = mean(intervals);
  const stdDev = standardDeviation(intervals);

  // Base confidence from how close average is to target
  const targetAccuracy = 1 - Math.abs(avgInterval - cycle.target) / cycle.tolerance;
  const varianceScore = 1 - Math.min(1, stdDev / (cycle.tolerance * 2));

  // More transactions = more confidence
  const countBonus = Math.min(20, (intervals.length - 1) * 5);

  const confidence = (targetAccuracy * 40) + (varianceScore * 40) + countBonus;
  return Math.round(Math.max(0, Math.min(100, confidence)));
}

// Predict next billing date
function predictNextDate(txns: Transaction[], cycle: { name: string; target: number }): string {
  const sorted = [...txns].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  const lastDate = new Date(sorted[0].date);
  lastDate.setDate(lastDate.getDate() + cycle.target);
  return lastDate.toISOString().split('T')[0];
}

// Stage 4: Apply exclusions and boosts
function applyExclusions(stream: TransactionStream, result: RecurrenceResult): RecurrenceResult {
  const merchant = stream.merchantNormalized.toLowerCase();

  // Hard exclusions
  const exclusionCategories = ['gas_stations', 'groceries', 'restaurants', 'transfers'];
  for (const category of exclusionCategories) {
    const keywords = CATEGORY_EXCLUSIONS[category as keyof typeof CATEGORY_EXCLUSIONS];
    if (keywords.some(k => merchant.includes(k))) {
      return { ...result, isRecurring: false, confidence: 0, excludedReason: category };
    }
  }

  // Confidence boosts
  const boostCategories = ['streaming', 'software', 'ai_tools', 'fitness', 'utilities', 'memberships'];
  for (const category of boostCategories) {
    const keywords = CATEGORY_EXCLUSIONS[category as keyof typeof CATEGORY_EXCLUSIONS];
    if (keywords.some(k => merchant.includes(k))) {
      return { ...result, confidence: Math.min(100, result.confidence + 20) };
    }
  }

  return result;
}

// Stage 5: Finalize subscription with maturity gate
function finalizeSubscription(stream: TransactionStream, result: RecurrenceResult): SubscriptionResult | null {
  if (!result.isRecurring) return null;

  const count = stream.transactions.length;
  const avgAmount = mean(stream.amountCluster);
  const totalSpent = stream.amountCluster.reduce((a, b) => a + b, 0);

  const sorted = [...stream.transactions].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  return {
    merchant: stream.merchantNormalized,
    status: count >= 3 ? 'mature' : 'early_detection',
    confidence: result.confidence,
    cycle: result.cycle || null,
    avgAmount,
    totalSpent,
    transactionCount: count,
    firstSeen: sorted[0].date,
    lastSeen: sorted[sorted.length - 1].date,
    predictedNext: result.predictedNext || null,
    estimatedMonthly: estimateMonthly(avgAmount, result.cycle || null)
  };
}

// Estimate monthly cost
function estimateMonthly(avg: number, cycle: string | null): number {
  const multipliers: Record<string, number> = {
    weekly: 4.33,
    biweekly: 2.17,
    monthly: 1,
    quarterly: 0.33,
    annual: 0.083,
    custom: 1
  };
  return avg * (multipliers[cycle || 'monthly'] || 1);
}

// Main export: Run full pipeline
export function analyzeSubscriptions(transactions: Transaction[]): SubscriptionResult[] {
  // Stage 2: Cluster into streams
  const streams = clusterIntoStreams(transactions);

  const results: SubscriptionResult[] = [];

  for (const stream of streams) {
    // Stage 3: Detect recurrence
    let recurrence = detectRecurrence(stream);

    // Stage 4: Apply exclusions/boosts
    recurrence = applyExclusions(stream, recurrence);

    // Stage 5: Finalize
    const subscription = finalizeSubscription(stream, recurrence);

    if (subscription && subscription.confidence >= 50) {
      results.push(subscription);
    }
  }

  // Sort by confidence (mature first, then by confidence score)
  return results.sort((a, b) => {
    if (a.status !== b.status) return a.status === 'mature' ? -1 : 1;
    return b.confidence - a.confidence;
  });
}

// Format for AI context
export function formatSubscriptionsForContext(subscriptions: SubscriptionResult[]): string {
  if (subscriptions.length === 0) return '';

  const mature = subscriptions.filter(s => s.status === 'mature');
  const early = subscriptions.filter(s => s.status === 'early_detection');
  const totalMonthly = subscriptions.reduce((sum, s) => sum + s.estimatedMonthly, 0);

  const lines: string[] = [];
  lines.push(`### Detected Subscriptions (~$${totalMonthly.toFixed(2)}/month total)`);

  if (mature.length > 0) {
    lines.push(`\n**Confirmed (${mature.length}):**`);
    for (const s of mature) {
      const cycle = s.cycle ? ` (${s.cycle})` : '';
      const monthly = s.cycle !== 'monthly' ? ` ~$${s.estimatedMonthly.toFixed(2)}/mo` : '';
      lines.push(`- ${s.merchant}: $${s.avgAmount.toFixed(2)}${cycle}${monthly} [${s.confidence}%]`);
    }
  }

  if (early.length > 0) {
    lines.push(`\n**Early Detection (${early.length}):**`);
    for (const s of early) {
      lines.push(`- ${s.merchant}: $${s.avgAmount.toFixed(2)} (needs more data) [${s.confidence}%]`);
    }
  }

  return lines.join('\n');
}
