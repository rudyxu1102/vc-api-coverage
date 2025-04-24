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

export class JSONReporter {
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

    const jsonContent = {
      timestamp: new Date().toISOString(),
      summary: this.calculateOverallStats(),
      components: this.coverageData.map(component => ({
        name: component.name,
        file: component.file,
        coverage: {
          props: {
            total: component.props.total,
            covered: component.props.covered,
            percentage: component.props.total ? (component.props.covered / component.props.total * 100) : 100,
            details: component.props.details
          },
          events: {
            total: component.emits.total,
            covered: component.emits.covered,
            percentage: component.emits.total ? (component.emits.covered / component.emits.total * 100) : 100,
            details: component.emits.details
          },
          slots: {
            total: component.slots.total,
            covered: component.slots.covered,
            percentage: component.slots.total ? (component.slots.covered / component.slots.total * 100) : 100,
            details: component.slots.details
          },
          methods: {
            total: component.exposes.total,
            covered: component.exposes.covered,
            percentage: component.exposes.total ? (component.exposes.covered / component.exposes.total * 100) : 100,
            details: component.exposes.details
          }
        }
      }))
    }

    fs.writeFileSync(
      path.join(reportDir, 'coverage.json'),
      JSON.stringify(jsonContent, null, 2)
    )
  }

  private calculateOverallStats() {
    if (this.coverageData.length === 0) {
      return {
        props: 0,
        events: 0,
        slots: 0,
        methods: 0,
        total: 0
      }
    }

    const totalStats = this.coverageData.reduce((acc, component) => {
      acc.props.total += component.props.total
      acc.props.covered += component.props.covered
      acc.events.total += component.emits.total
      acc.events.covered += component.emits.covered
      acc.slots.total += component.slots.total
      acc.slots.covered += component.slots.covered
      acc.methods.total += component.exposes.total
      acc.methods.covered += component.exposes.covered
      return acc
    }, {
      props: { total: 0, covered: 0 },
      events: { total: 0, covered: 0 },
      slots: { total: 0, covered: 0 },
      methods: { total: 0, covered: 0 }
    })

    const stats = {
      props: totalStats.props.total ? (totalStats.props.covered / totalStats.props.total) * 100 : 100,
      events: totalStats.events.total ? (totalStats.events.covered / totalStats.events.total) * 100 : 100,
      slots: totalStats.slots.total ? (totalStats.slots.covered / totalStats.slots.total) * 100 : 100,
      methods: totalStats.methods.total ? (totalStats.methods.covered / totalStats.methods.total) * 100 : 100
    }

    // 计算总体覆盖率
    const totalCovered = totalStats.props.covered + totalStats.events.covered + 
                        totalStats.slots.covered + totalStats.methods.covered
    const totalItems = totalStats.props.total + totalStats.events.total + 
                      totalStats.slots.total + totalStats.methods.total

    return {
      ...stats,
      total: totalItems ? (totalCovered / totalItems) * 100 : 100
    }
  }
} 