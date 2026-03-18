import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import { jsPDF } from 'jspdf'

interface Transaction {
  id: string
  date: string
  description: string
  amount: number
  category: string | null
  merchant_name: string | null
}

interface ReportData {
  title: string
  dateRange: { start: string; end: string }
  totalIncome: number
  totalExpenses: number
  netCashflow: number
  categoryBreakdown: { category: string; amount: number }[]
  recurringPayments: { merchant: string; count: number; avgAmount: number; totalAmount: number }[]
  transactions: Transaction[]
  generatedAt: string
}

// GET /api/reports/generate - Generate a financial report PDF (for direct download)
export async function GET(request: NextRequest) {
  return generateReport(request)
}

// POST /api/reports/generate - Generate a financial report PDF
export async function POST(request: NextRequest) {
  return generateReport(request)
}

async function generateReport(request: NextRequest) {
  try {
    const supabase = await createClient()

    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Support both query params (GET) and body (POST)
    const url = new URL(request.url)
    let months = 3
    let type = 'subscription_analysis'

    if (request.method === 'GET') {
      months = parseInt(url.searchParams.get('months') || '3')
      type = url.searchParams.get('type') || 'subscription_analysis'
    } else {
      const body = await request.json().catch(() => ({}))
      months = body.months || 3
      type = body.type || 'subscription_analysis'
    }

    // Calculate date range
    const endDate = new Date()
    const startDate = new Date()
    startDate.setMonth(startDate.getMonth() - months)

    // Fetch transactions with category join
    const { data: transactions } = await supabase
      .from('transactions')
      .select(`
        id,
        date,
        description,
        amount,
        merchant_name,
        transaction_categories(name)
      `)
      .eq('user_id', user.id)
      .is('deleted_at', null)
      .gte('date', startDate.toISOString().split('T')[0])
      .lte('date', endDate.toISOString().split('T')[0])
      .order('date', { ascending: false })

    // Map transactions to expected format
    const mappedTransactions: Transaction[] = (transactions || []).map((t: Record<string, unknown>) => ({
      id: t.id as string,
      date: t.date as string,
      description: t.description as string,
      amount: t.amount as number,
      category: (t.transaction_categories as { name: string } | null)?.name || null,
      merchant_name: t.merchant_name as string | null,
    }))

    if (!mappedTransactions || mappedTransactions.length === 0) {
      return NextResponse.json({ error: 'No transactions found for this period' }, { status: 404 })
    }

    // Calculate totals
    const totalIncome = mappedTransactions
      .filter(t => t.amount > 0)
      .reduce((sum, t) => sum + t.amount, 0)

    const totalExpenses = mappedTransactions
      .filter(t => t.amount < 0)
      .reduce((sum, t) => sum + Math.abs(t.amount), 0)

    // Category breakdown
    const categoryMap: Record<string, number> = {}
    mappedTransactions.forEach(t => {
      if (t.amount < 0) {
        const cat = t.category || 'Uncategorized'
        categoryMap[cat] = (categoryMap[cat] || 0) + Math.abs(t.amount)
      }
    })

    const categoryBreakdown = Object.entries(categoryMap)
      .map(([category, amount]) => ({ category, amount }))
      .sort((a, b) => b.amount - a.amount)

    // Recurring payments analysis
    const merchantMap: Record<string, { count: number; amounts: number[] }> = {}
    mappedTransactions.forEach(t => {
      if (t.amount < 0) {
        const merchant = (t.merchant_name || t.description).toUpperCase().trim().substring(0, 40)
        if (!merchantMap[merchant]) {
          merchantMap[merchant] = { count: 0, amounts: [] }
        }
        merchantMap[merchant].count++
        merchantMap[merchant].amounts.push(Math.abs(t.amount))
      }
    })

    const recurringPayments = Object.entries(merchantMap)
      .filter(([_, data]) => data.count >= 2)
      .map(([merchant, data]) => ({
        merchant,
        count: data.count,
        avgAmount: data.amounts.reduce((a, b) => a + b, 0) / data.amounts.length,
        totalAmount: data.amounts.reduce((a, b) => a + b, 0),
      }))
      .sort((a, b) => b.count - a.count)

    // Build report data
    const reportData: ReportData = {
      title: type === 'subscription_analysis'
        ? 'Subscription & Recurring Payments Analysis'
        : 'Financial Summary Report',
      dateRange: {
        start: startDate.toISOString().split('T')[0],
        end: endDate.toISOString().split('T')[0],
      },
      totalIncome,
      totalExpenses,
      netCashflow: totalIncome - totalExpenses,
      categoryBreakdown,
      recurringPayments,
      transactions: mappedTransactions,
      generatedAt: new Date().toISOString(),
    }

    // Generate PDF
    const pdfBuffer = generatePDF(reportData)

    // Return PDF as download
    return new NextResponse(new Uint8Array(pdfBuffer), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="financial-report-${reportData.dateRange.start}-to-${reportData.dateRange.end}.pdf"`,
      },
    })
  } catch (error) {
    console.error('Report generation error:', error)
    return NextResponse.json(
      { error: 'Failed to generate report' },
      { status: 500 }
    )
  }
}

function generatePDF(data: ReportData): Buffer {
  const doc = new jsPDF()
  const pageWidth = doc.internal.pageSize.getWidth()
  let y = 20

  // Helper functions
  const addTitle = (text: string, size: number = 16) => {
    doc.setFontSize(size)
    doc.setFont('helvetica', 'bold')
    doc.text(text, 14, y)
    y += size * 0.5 + 4
  }

  const addText = (text: string, size: number = 10) => {
    doc.setFontSize(size)
    doc.setFont('helvetica', 'normal')
    doc.text(text, 14, y)
    y += size * 0.4 + 2
  }

  const addLine = () => {
    doc.setDrawColor(200, 200, 200)
    doc.line(14, y, pageWidth - 14, y)
    y += 5
  }

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(amount)
  }

  const checkPageBreak = (needed: number = 30) => {
    if (y > 270 - needed) {
      doc.addPage()
      y = 20
    }
  }

  // Title
  addTitle(data.title, 18)
  addText(`Report Period: ${data.dateRange.start} to ${data.dateRange.end}`, 11)
  addText(`Generated: ${new Date(data.generatedAt).toLocaleString()}`, 9)
  y += 5
  addLine()

  // Executive Summary
  addTitle('Executive Summary', 14)
  addText(`Total Income: ${formatCurrency(data.totalIncome)}`)
  addText(`Total Expenses: ${formatCurrency(data.totalExpenses)}`)
  addText(`Net Cashflow: ${formatCurrency(data.netCashflow)}`)
  addText(`Total Transactions: ${data.transactions.length}`)
  y += 5
  addLine()

  // Recurring Payments Section
  checkPageBreak(50)
  addTitle('Recurring & Subscription Payments', 14)
  addText(`Found ${data.recurringPayments.length} merchants with recurring payments:`, 10)
  y += 3

  const monthlyEstimate = data.recurringPayments
    .filter(r => r.count >= 2)
    .reduce((sum, r) => {
      // Estimate monthly based on frequency
      const monthlyAmount = r.avgAmount * (r.count / 3) // rough estimate over 3 months
      return sum + monthlyAmount
    }, 0)

  addText(`Estimated Monthly Recurring: ${formatCurrency(monthlyEstimate)}`, 11)
  y += 5

  // List recurring payments
  data.recurringPayments.slice(0, 20).forEach((payment, i) => {
    checkPageBreak()
    const text = `${i + 1}. ${payment.merchant.substring(0, 35)}`
    const amount = `${payment.count}x | Avg: ${formatCurrency(payment.avgAmount)} | Total: ${formatCurrency(payment.totalAmount)}`
    doc.setFontSize(9)
    doc.setFont('helvetica', 'bold')
    doc.text(text, 14, y)
    doc.setFont('helvetica', 'normal')
    doc.text(amount, pageWidth - 14 - doc.getTextWidth(amount), y)
    y += 5
  })

  y += 5
  addLine()

  // Spending by Category
  checkPageBreak(50)
  addTitle('Spending by Category', 14)

  data.categoryBreakdown.slice(0, 15).forEach((cat, i) => {
    checkPageBreak()
    const percentage = ((cat.amount / data.totalExpenses) * 100).toFixed(1)
    const text = `${i + 1}. ${cat.category}`
    const amount = `${formatCurrency(cat.amount)} (${percentage}%)`
    doc.setFontSize(9)
    doc.setFont('helvetica', 'normal')
    doc.text(text, 14, y)
    doc.text(amount, pageWidth - 14 - doc.getTextWidth(amount), y)
    y += 5
  })

  y += 5
  addLine()

  // Transaction List
  doc.addPage()
  y = 20
  addTitle('All Transactions', 14)

  // Header
  doc.setFontSize(8)
  doc.setFont('helvetica', 'bold')
  doc.text('Date', 14, y)
  doc.text('Description', 40, y)
  doc.text('Category', 120, y)
  doc.text('Amount', pageWidth - 14 - 25, y)
  y += 5
  addLine()

  // Transactions
  data.transactions.forEach((tx) => {
    checkPageBreak(8)
    doc.setFontSize(7)
    doc.setFont('helvetica', 'normal')
    doc.text(tx.date, 14, y)
    doc.text((tx.merchant_name || tx.description).substring(0, 40), 40, y)
    doc.text((tx.category || 'Uncategorized').substring(0, 20), 120, y)

    const amountText = formatCurrency(tx.amount)
    if (tx.amount < 0) {
      doc.setTextColor(180, 0, 0)
    } else {
      doc.setTextColor(0, 130, 0)
    }
    doc.text(amountText, pageWidth - 14 - doc.getTextWidth(amountText), y)
    doc.setTextColor(0, 0, 0)
    y += 4
  })

  // Footer on last page
  const pageCount = doc.getNumberOfPages()
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i)
    doc.setFontSize(8)
    doc.setTextColor(150, 150, 150)
    doc.text(`Page ${i} of ${pageCount}`, pageWidth / 2, 290, { align: 'center' })
    doc.text('Generated by Project Helios', 14, 290)
  }

  // Return as buffer
  const pdfOutput = doc.output('arraybuffer')
  return Buffer.from(pdfOutput)
}
