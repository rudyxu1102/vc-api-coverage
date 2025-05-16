import fs from 'fs'
import path from 'path'
import { VcTotalData } from '../types'
import { getTotalData } from '../common/utils'

interface ComponentCoverage {
  name: string
  file: string
  props: {
    total: number
    covered: number
    details: Array<{ name: string; covered: boolean }>
  }
  emits: {
    total: number
    covered: number
    details: Array<{ name: string; covered: boolean }>
  }
  slots: {
    total: number
    covered: number
    details: Array<{ name: string; covered: boolean }>
  }
  exposes: {
    total: number
    covered: number
    details: Array<{ name: string; covered: boolean }>
  }
}

export class HTMLReporter {
  private outputDir: string
  private coverageData: ComponentCoverage[] = []
  private totalData: VcTotalData = {
    props: {
      total: 0,
      covered: 0
    },
    slots: {
      total: 0,
      covered: 0
    },
    exposes: {
      total: 0,
      covered: 0
    }
  }

  constructor(outputDir = 'coverage') {
    this.outputDir = outputDir
  }

  public setCoverageData(data: ComponentCoverage[]) {
    this.coverageData = data
    this.totalData =  getTotalData(data)

  }

  public async generateReport() {
    const reportDir = path.resolve(process.cwd(), this.outputDir)
    
    try {
      // Ensure directory exists with better error handling
      if (!fs.existsSync(reportDir)) {
        fs.mkdirSync(reportDir, { recursive: true })
      }
  
      const htmlContent = this.generateHTML()
      const filePath = path.join(reportDir, 'index.html')
      fs.writeFileSync(filePath, htmlContent)
      return filePath
    } catch (error) {
      console.error(`Failed to generate report: ${error as Error}.message`)
      throw error
    }
  }

  private generateHTML(): string {
    const overallStats = this.calculateOverallStats()
    const componentRows = this.generateComponentRows()
    const chartData = this.prepareChartData()

    const noApiMessage = this.coverageData.length === 0 ? '<div class="text-center text-gray-500 mt-4">No API found</div>' : ''

    return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Vue Component API Coverage Report</title>
    <script src="https://cdn.tailwindcss.com"></script>
    <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
    <style>
        .coverage-badge {
            display: inline-block;
            padding: 4px 8px;
            border-radius: 9999px;
            font-size: 12px;
            font-weight: 500;
        }
        .coverage-high { background-color: #DEF7EC; color: #03543F; }
        .coverage-medium { background-color: #FEF3C7; color: #92400E; }
        .coverage-low { background-color: #FEE2E2; color: #991B1B; }
    </style>
</head>
<body class="bg-gray-50">
    <div class="container mx-auto px-4 py-8">
        <div class="flex items-center justify-between mb-8">
            <h1 class="text-3xl font-bold">Vue Component API Coverage Report</h1>
            <div class="text-sm text-gray-500">
                Generated on ${new Date().toLocaleString()}
            </div>
        </div>
        
        <!-- Summary Section -->
        <div class="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
            <!-- Stats Cards -->
            <div class="bg-white rounded-lg shadow-lg p-6">
                <h2 class="text-xl font-semibold mb-4">Overall Coverage</h2>
                <div class="grid grid-cols-2 gap-4">
                    ${this.generateOverallStats(overallStats)}
                </div>
            </div>
            
            <!-- Chart -->
            <div class="bg-white rounded-lg shadow-lg p-6">
                <h2 class="text-xl font-semibold mb-4">Coverage Distribution</h2>
                <canvas id="coverageChart"></canvas>
            </div>
        </div>

        <!-- Components Table -->
        <div class="bg-white rounded-lg shadow-lg p-6">
            <h2 class="text-xl font-semibold mb-4">Component Details</h2>
            ${noApiMessage}
            <div class="overflow-x-auto">
                <table class="min-w-full divide-y divide-gray-200">
                    <thead>
                        <tr class="bg-gray-50">
                            <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Component</th>
                            <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Props</th>
                            <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Events</th>
                            <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Slots</th>
                            <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Methods</th>
                        </tr>
                    </thead>
                    <tbody class="bg-white divide-y divide-gray-200">
                        ${componentRows}
                    </tbody>
                </table>
            </div>
        </div>
    </div>

    <script>
        // Initialize chart
        const ctx = document.getElementById('coverageChart').getContext('2d');
        new Chart(ctx, {
            type: 'bar',
            data: ${JSON.stringify(chartData)},
            options: {
                responsive: true,
                scales: {
                    y: {
                        beginAtZero: true,
                        max: 100,
                        title: {
                            display: true,
                            text: 'Coverage %'
                        }
                    }
                },
                plugins: {
                    legend: {
                        display: true,
                        position: 'bottom'
                    }
                }
            }
        });
    </script>
</body>
</html>`
  }

  private calculateOverallStats() {
    if (this.coverageData.length === 0) {
      return {
        props: 100,
        slots: 100,
        exposes: 100
      }
    }

    const totalStats = this.totalData

    return {
      props: totalStats.props.total ? (totalStats.props.covered / totalStats.props.total) * 100 : 100,
      slots: totalStats.slots.total ? (totalStats.slots.covered / totalStats.slots.total) * 100 : 100,
      exposes: totalStats.exposes.total ? (totalStats.exposes.covered / totalStats.exposes.total) * 100 : 100
    }
  }

  private generateOverallStats(stats: { props: number; slots: number; exposes: number }): string {
    return `
      <div class="stat-card">
        <h3 class="text-sm font-medium text-gray-500">Props Coverage</h3>
        <p class="mt-1">
          <span class="coverage-badge ${this.getCoverageBadgeClass(stats.props)}">
            Props Coverage: ${stats.props.toFixed(0)}%
          </span>
        </p>
      </div>
      <div class="stat-card">
        <h3 class="text-sm font-medium text-gray-500">Slots Coverage</h3>
        <p class="mt-1">
          <span class="coverage-badge ${this.getCoverageBadgeClass(stats.slots)}">
            Slots Coverage: ${stats.slots.toFixed(0)}%
          </span>
        </p>
      </div>
      <div class="stat-card">
        <h3 class="text-sm font-medium text-gray-500">Methods Coverage</h3>
        <p class="mt-1">
          <span class="coverage-badge ${this.getCoverageBadgeClass(stats.exposes)}">
            Methods Coverage: ${stats.exposes.toFixed(0)}%
          </span>
        </p>
      </div>
    `
  }

  private generateComponentRows(): string {
    if (this.coverageData.length === 0) {
      return `
        <tr>
          <td colspan="5" class="px-6 py-4 text-center text-gray-500">
            No API found
          </td>
        </tr>
      `
    }

    return this.coverageData.map(component => {
      const propsCoverage = component.props.total ? (component.props.covered / component.props.total * 100) : 100
      const emitsCoverage = component.emits.total ? (component.emits.covered / component.emits.total * 100) : 100
      const slotsCoverage = component.slots.total ? (component.slots.covered / component.slots.total * 100) : 100
      const exposesCoverage = component.exposes.total ? (component.exposes.covered / component.exposes.total * 100) : 100

      const hasNoApi = component.props.total === 0 && component.emits.total === 0 && 
                      component.slots.total === 0 && component.exposes.total === 0

      if (hasNoApi) {
        return `
          <tr>
            <td class="px-6 py-4 whitespace-nowrap">
              <div class="text-sm font-medium text-gray-900">${component.name}</div>
              <div class="text-sm text-gray-500">${component.file}</div>
            </td>
            <td colspan="4" class="px-6 py-4 text-center text-gray-500">
              No API found
            </td>
          </tr>
        `
      }

      return `
        <tr>
          <td class="px-6 py-4 whitespace-nowrap">
            <div class="text-sm font-medium text-gray-900">${component.name}</div>
            <div class="text-sm text-gray-500">${component.file}</div>
          </td>
          <td class="px-6 py-4 whitespace-nowrap">
            <span class="coverage-badge ${this.getCoverageBadgeClass(propsCoverage)}">
              ${component.props.covered}/${component.props.total}
              <span class="ml-1">(${propsCoverage.toFixed(0)}%)</span>
            </span>
          </td>
          <td class="px-6 py-4 whitespace-nowrap">
            <span class="coverage-badge ${this.getCoverageBadgeClass(emitsCoverage)}">
              ${component.emits.covered}/${component.emits.total}
              <span class="ml-1">(${emitsCoverage.toFixed(0)}%)</span>
            </span>
          </td>
          <td class="px-6 py-4 whitespace-nowrap">
            <span class="coverage-badge ${this.getCoverageBadgeClass(slotsCoverage)}">
              ${component.slots.covered}/${component.slots.total}
              <span class="ml-1">(${slotsCoverage.toFixed(0)}%)</span>
            </span>
          </td>
          <td class="px-6 py-4 whitespace-nowrap">
            <span class="coverage-badge ${this.getCoverageBadgeClass(exposesCoverage)}">
              ${component.exposes.covered}/${component.exposes.total}
              <span class="ml-1">(${exposesCoverage.toFixed(0)}%)</span>
            </span>
          </td>
        </tr>
      `
    }).join('')
  }

  private prepareChartData() {
    const labels = this.coverageData.map(c => c.name)
    const datasets = [
      {
        label: 'Props',
        data: this.coverageData.map(c => c.props.total ? (c.props.covered / c.props.total * 100) : 100),
        backgroundColor: 'rgba(59, 130, 246, 0.5)'
      },
      {
        label: 'Events',
        data: this.coverageData.map(c => c.emits.total ? (c.emits.covered / c.emits.total * 100) : 100),
        backgroundColor: 'rgba(16, 185, 129, 0.5)'
      },
      {
        label: 'Slots',
        data: this.coverageData.map(c => c.slots.total ? (c.slots.covered / c.slots.total * 100) : 100),
        backgroundColor: 'rgba(139, 92, 246, 0.5)'
      },
      {
        label: 'Methods',
        data: this.coverageData.map(c => c.exposes.total ? (c.exposes.covered / c.exposes.total * 100) : 100),
        backgroundColor: 'rgba(245, 158, 11, 0.5)'
      }
    ]
    return { labels, datasets }
  }

  private getCoverageBadgeClass(percentage: number): string {
    if (percentage >= 80) return 'coverage-high'
    if (percentage >= 50) return 'coverage-medium'
    return 'coverage-low'
  }
} 