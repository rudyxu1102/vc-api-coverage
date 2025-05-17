import fs from 'fs'
import path from 'path'
import { VcCoverageData } from '../types'

export class HTMLReporter {
  private outputDir: string
  private coverageData: VcCoverageData[] = []
 
  constructor(outputDir = 'coverage') {
    this.outputDir = outputDir
  }

  public setCoverageData(data: VcCoverageData[]) {
    this.coverageData = data

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
        <div class="bg-white rounded-lg shadow-lg p-6">
          <div class="flex items-center justify-between mb-8">
              <h1 class="text-2xl font-bold">Vue Component API Coverage</h1>
              <div class="text-sm text-gray-500">
                  Generated on ${new Date().toLocaleString()}
              </div>
          </div>
            ${noApiMessage}
            <div class="overflow-x-auto">
                <table class="min-w-full divide-y divide-gray-200">
                    <thead>
                        <tr class="bg-gray-50">
                            <th class="px-6 py-3 text-left text-sm font-medium text-gray-500 tracking-wider">Components</th>
                            <th class="px-6 py-3 text-left text-sm font-medium text-gray-500 tracking-wider">Props/Events</th>
                            <th class="px-6 py-3 text-left text-sm font-medium text-gray-500 tracking-wider">Slots</th>
                            <th class="px-6 py-3 text-left text-sm font-medium text-gray-500 tracking-wider">Exposes</th>
                            <th class="px-6 py-3 text-left text-sm font-medium text-gray-500 tracking-wider">Uncovered APIs</th>
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

  getUncoveredApi(info: VcCoverageData) {
    const res = []
    res.push(...info.props.details.filter(detail => detail.covered === false))
    res.push(...info.slots.details.filter(detail => detail.covered === false))
    res.push(...info.exposes.details.filter(detail => detail.covered === false))
    return res
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
      const slotsCoverage = component.slots.total ? (component.slots.covered / component.slots.total * 100) : 100
      const exposesCoverage = component.exposes.total ? (component.exposes.covered / component.exposes.total * 100) : 100

      const hasNoApi = component.props.total === 0 && component.slots.total === 0 && component.exposes.total === 0
      const uncoveredProps = this.getUncoveredApi(component)
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
          </td>
          <td class="px-6 py-4 whitespace-nowrap">
            <span class="coverage-badge ${this.getCoverageBadgeClass(propsCoverage)}">
              ${component.props.covered}/${component.props.total}
              <span class="ml-1">(${propsCoverage.toFixed(0)}%)</span>
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
          <td class="px-6 py-4">
            ${uncoveredProps.map(detail => {
                return `
                  <span class="inline-block text-sm text-gray-500 bg-gray-100 px-2 py-1 rounded-md my-1">${detail.name}</span>
                `
              }).join('')}
              ${uncoveredProps.length === 0 ? '<span class="text-green-500">✓</span>' : ''}
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
        label: 'Slots',
        data: this.coverageData.map(c => c.slots.total ? (c.slots.covered / c.slots.total * 100) : 100),
        backgroundColor: 'rgba(139, 92, 246, 0.5)'
      },
      {
        label: 'Exposes',
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