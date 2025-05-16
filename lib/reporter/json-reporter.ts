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
    this.totalData = getTotalData(data)
  }

  public async generateReport() {
    const reportDir = path.resolve(process.cwd(), this.outputDir)
    if (!fs.existsSync(reportDir)) {
      fs.mkdirSync(reportDir, { recursive: true })
    }

    const jsonContent = {
      summary: {
        totalComponents: this.coverageData.length,
        totalProps: this.totalData.props.total,
        coveredProps: this.totalData.props.covered,
        totalSlots: this.totalData.slots.total,
        coveredSlots: this.totalData.slots.covered,
        totalExposes: this.totalData.exposes.total,
        coveredExposes: this.totalData.exposes.covered
      },
      stats: this.calculateOverallStats(),
      components: this.coverageData
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
        slots: 0,
        methods: 0,
        total: 0
      }
    }

    const totalStats = this.totalData

    const stats = {
      props: totalStats.props.total ? (totalStats.props.covered / totalStats.props.total) * 100 : 100,
      slots: totalStats.slots.total ? (totalStats.slots.covered / totalStats.slots.total) * 100 : 100,
      methods: totalStats.exposes.total ? (totalStats.exposes.covered / totalStats.exposes.total) * 100 : 100
    }

    // 计算总体覆盖率
    const totalCovered = totalStats.props.covered + totalStats.slots.covered + totalStats.exposes.covered
    const totalItems = totalStats.props.total + totalStats.slots.total + totalStats.exposes.total

    return {
      ...stats,
      total: totalItems ? (totalCovered / totalItems) * 100 : 100
    }
  }
} 