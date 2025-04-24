import fs from 'fs'
import path from 'path'

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

  constructor(outputDir = 'coverage') {
    this.outputDir = outputDir
  }

  public setCoverageData(data: ComponentCoverage[]) {
    this.coverageData = data
  }

  public async generateReport() {
    const reportDir = path.resolve(process.cwd(), this.outputDir)
    if (!fs.existsSync(reportDir)) {
      fs.mkdirSync(reportDir, { recursive: true })
    }

    const htmlContent = this.generateHTML()
    fs.writeFileSync(path.join(reportDir, 'index.html'), htmlContent)
  }

  private generateHTML(): string {
    const overallStats = this.calculateOverallStats()
    const componentRows = this.generateComponentRows()
    const chartData = this.prepareChartData()

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
        props: 0,
        emits: 0,
        slots: 0,
        exposes: 0
      }
    }

    const totalStats = this.coverageData.reduce((acc, component) => {
      acc.props.total += component.props.total
      acc.props.covered += component.props.covered
      acc.emits.total += component.emits.total
      acc.emits.covered += component.emits.covered
      acc.slots.total += component.slots.total
      acc.slots.covered += component.slots.covered
      acc.exposes.total += component.exposes.total
      acc.exposes.covered += component.exposes.covered
      return acc
    }, {
      props: { total: 0, covered: 0 },
      emits: { total: 0, covered: 0 },
      slots: { total: 0, covered: 0 },
      exposes: { total: 0, covered: 0 }
    })

    return {
      props: totalStats.props.total ? (totalStats.props.covered / totalStats.props.total) * 100 : 100,
      emits: totalStats.emits.total ? (totalStats.emits.covered / totalStats.emits.total) * 100 : 100,
      slots: totalStats.slots.total ? (totalStats.slots.covered / totalStats.slots.total) * 100 : 100,
      exposes: totalStats.exposes.total ? (totalStats.exposes.covered / totalStats.exposes.total) * 100 : 100
    }
  }

  private generateOverallStats(stats: { props: number; emits: number; slots: number; exposes: number }): string {
    return `
      <div class="stat-card">
        <h3 class="text-sm font-medium text-gray-500">Props Coverage</h3>
        <p class="mt-1">
          <span class="coverage-badge ${this.getCoverageBadgeClass(stats.props)}">
            ${stats.props.toFixed(1)}%
          </span>
        </p>
      </div>
      <div class="stat-card">
        <h3 class="text-sm font-medium text-gray-500">Events Coverage</h3>
        <p class="mt-1">
          <span class="coverage-badge ${this.getCoverageBadgeClass(stats.emits)}">
            ${stats.emits.toFixed(1)}%
          </span>
        </p>
      </div>
      <div class="stat-card">
        <h3 class="text-sm font-medium text-gray-500">Slots Coverage</h3>
        <p class="mt-1">
          <span class="coverage-badge ${this.getCoverageBadgeClass(stats.slots)}">
            ${stats.slots.toFixed(1)}%
          </span>
        </p>
      </div>
      <div class="stat-card">
        <h3 class="text-sm font-medium text-gray-500">Methods Coverage</h3>
        <p class="mt-1">
          <span class="coverage-badge ${this.getCoverageBadgeClass(stats.exposes)}">
            ${stats.exposes.toFixed(1)}%
          </span>
        </p>
      </div>
    `
  }

  private generateComponentRows(): string {
    return this.coverageData.map(component => `
      <tr>
        <td class="px-6 py-4 whitespace-nowrap">
          <div class="text-sm font-medium text-gray-900">${component.name}</div>
          <div class="text-sm text-gray-500">${component.file}</div>
        </td>
        <td class="px-6 py-4 whitespace-nowrap">
          <span class="coverage-badge ${this.getCoverageBadgeClass(component.props.covered / component.props.total * 100)}">
            ${component.props.covered}/${component.props.total}
          </span>
        </td>
        <td class="px-6 py-4 whitespace-nowrap">
          <span class="coverage-badge ${this.getCoverageBadgeClass(component.emits.covered / component.emits.total * 100)}">
            ${component.emits.covered}/${component.emits.total}
          </span>
        </td>
        <td class="px-6 py-4 whitespace-nowrap">
          <span class="coverage-badge ${this.getCoverageBadgeClass(component.slots.covered / component.slots.total * 100)}">
            ${component.slots.covered}/${component.slots.total}
          </span>
        </td>
        <td class="px-6 py-4 whitespace-nowrap">
          <span class="coverage-badge ${this.getCoverageBadgeClass(component.exposes.covered / component.exposes.total * 100)}">
            ${component.exposes.covered}/${component.exposes.total}
          </span>
        </td>
      </tr>
    `).join('')
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