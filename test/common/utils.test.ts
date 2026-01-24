import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import {
  logDebug,
  logError,
  colorizePercentage,
  roundPercentage,
  getTotalData,
  toEventName,
  isComponentFile,
  getThrowableMessage,
  getAsbFilePath,
  isComponentType
} from '../../src/common/utils'
import type { VcCoverageData } from '../../src/types'
import type { Type } from 'ts-morph'
import fs from 'fs'
import path from 'path'

describe('utils', () => {
  describe('logDebug', () => {
    let originalDebug: string | undefined

    beforeEach(() => {
      originalDebug = process.env.DEBUG
      vi.spyOn(console, 'log').mockImplementation(() => {})
    })

    afterEach(() => {
      process.env.DEBUG = originalDebug
      vi.restoreAllMocks()
    })

    it('should log debug message when DEBUG is set', () => {
      process.env.DEBUG = 'true'
      logDebug('TestModule', 'test message', 'arg1', 'arg2')
      expect(console.log).toHaveBeenCalledWith('[TestModule] test message', 'arg1', 'arg2')
    })

    it('should not log debug message when DEBUG is not set', () => {
      delete process.env.DEBUG
      logDebug('TestModule', 'test message')
      expect(console.log).not.toHaveBeenCalled()
    })
  })

  describe('logError', () => {
    beforeEach(() => {
      vi.spyOn(console, 'error').mockImplementation(() => {})
    })

    afterEach(() => {
      vi.restoreAllMocks()
    })

    it('should log error message', () => {
      logError('TestModule', 'error message', 'arg1')
      expect(console.error).toHaveBeenCalledWith('[TestModule] error message', 'arg1')
    })
  })

  describe('colorizePercentage', () => {
    it('should return green for 100%', () => {
      const result = colorizePercentage(100)
      expect(result).toContain('100%')
    })

    it('should return yellow for 80%+', () => {
      const result = colorizePercentage(85)
      expect(result).toContain('85%')
    })

    it('should return yellow for exactly 80%', () => {
      const result = colorizePercentage(80)
      expect(result).toContain('80%')
    })

    it('should return red for below 80%', () => {
      const result = colorizePercentage(50)
      expect(result).toContain('50%')
    })

    it('should return red for 0%', () => {
      const result = colorizePercentage(0)
      expect(result).toContain('0%')
    })
  })

  describe('roundPercentage', () => {
    it('should calculate percentage correctly', () => {
      expect(roundPercentage(50, 100)).toBe(50)
      expect(roundPercentage(1, 3)).toBe(33)
      expect(roundPercentage(2, 3)).toBe(67)
    })

    it('should return 100 when total is 0', () => {
      expect(roundPercentage(0, 0)).toBe(100)
    })

    it('should round to nearest integer', () => {
      expect(roundPercentage(1, 6)).toBe(17)
      expect(roundPercentage(5, 6)).toBe(83)
    })
  })

  describe('getTotalData', () => {
    it('should calculate total data from coverage data', () => {
      const coverageData: VcCoverageData[] = [
        {
          name: 'Component1',
          file: '/path/Component1.vue',
          total: 5,
          covered: 3,
          props: { total: 2, covered: 1, details: [] },
          slots: { total: 2, covered: 1, details: [] },
          exposes: { total: 1, covered: 1, details: [] }
        },
        {
          name: 'Component2',
          file: '/path/Component2.vue',
          total: 4,
          covered: 2,
          props: { total: 2, covered: 1, details: [] },
          slots: { total: 1, covered: 0, details: [] },
          exposes: { total: 1, covered: 1, details: [] }
        }
      ]

      const result = getTotalData(coverageData)
      expect(result.props.total).toBe(4)
      expect(result.props.covered).toBe(2)
      expect(result.slots.total).toBe(3)
      expect(result.slots.covered).toBe(1)
      expect(result.exposes.total).toBe(2)
      expect(result.exposes.covered).toBe(2)
    })

    it('should handle empty coverage data', () => {
      const result = getTotalData([])
      expect(result.props.total).toBe(0)
      expect(result.props.covered).toBe(0)
      expect(result.slots.total).toBe(0)
      expect(result.slots.covered).toBe(0)
      expect(result.exposes.total).toBe(0)
      expect(result.exposes.covered).toBe(0)
    })

    it('should ignore items with zero totals', () => {
      const coverageData: VcCoverageData[] = [
        {
          name: 'Component1',
          file: '/path/Component1.vue',
          total: 0,
          covered: 0,
          props: { total: 0, covered: 0, details: [] },
          slots: { total: 0, covered: 0, details: [] },
          exposes: { total: 0, covered: 0, details: [] }
        }
      ]

      const result = getTotalData(coverageData)
      expect(result.props.total).toBe(0)
      expect(result.slots.total).toBe(0)
      expect(result.exposes.total).toBe(0)
    })
  })

  describe('toEventName', () => {
    it('should convert string to event name', () => {
      expect(toEventName('click')).toBe('onClick')
      expect(toEventName('update:modelValue')).toBe('onUpdate:modelValue')
    })

    it('should not modify string already starting with "on"', () => {
      expect(toEventName('onClick')).toBe('onClick')
      expect(toEventName('onUpdate:modelValue')).toBe('onUpdate:modelValue')
    })

    it('should handle empty string', () => {
      expect(toEventName('')).toBe('on')
    })

    it('should handle single character', () => {
      expect(toEventName('a')).toBe('onA')
    })
  })

  describe('isComponentFile', () => {
    it('should return true for .vue files', () => {
      expect(isComponentFile('Component.vue')).toBe(true)
      expect(isComponentFile('/path/to/Component.vue')).toBe(true)
    })

    it('should return true for .tsx files', () => {
      expect(isComponentFile('Component.tsx')).toBe(true)
      expect(isComponentFile('/path/to/Component.tsx')).toBe(true)
    })

    it('should return true for .jsx files', () => {
      expect(isComponentFile('Component.jsx')).toBe(true)
      expect(isComponentFile('/path/to/Component.jsx')).toBe(true)
    })

    it('should return false for other file types', () => {
      expect(isComponentFile('Component.ts')).toBe(false)
      expect(isComponentFile('Component.js')).toBe(false)
      expect(isComponentFile('Component.css')).toBe(false)
    })
  })

  describe('getThrowableMessage', () => {
    it('should format error with default split', () => {
      const error = new Error('Test error')
      error.name = 'TestError'
      const result = getThrowableMessage(error)
      expect(result).toContain('name: TestError')
      expect(result).toContain('message: Test error')
      expect(result).toContain('stack:')
    })

    it('should format error with custom split', () => {
      const error = new Error('Test error')
      const result = getThrowableMessage(error, ' | ')
      expect(result).toContain(' | name:')
      expect(result).toContain(' | message:')
      expect(result).toContain(' | stack:')
    })

    it('should handle error without name', () => {
      const error = { message: 'Test error', stack: 'stack trace' } as Error
      const result = getThrowableMessage(error)
      expect(result).toContain('name: Error')
      expect(result).toContain('message: Test error')
    })

    it('should handle error without message', () => {
      const error = { name: 'TestError', stack: 'stack trace' } as Error
      const result = getThrowableMessage(error)
      expect(result).toContain('name: TestError')
      expect(result).toContain('message: ')
    })

    it('should handle error without stack', () => {
      const error = { name: 'TestError', message: 'Test error' } as Error
      const result = getThrowableMessage(error)
      expect(result).toContain('name: TestError')
      expect(result).toContain('message: Test error')
      expect(result).toContain('stack: ')
    })
  })

  describe('getAsbFilePath', () => {
    it('should return path for file with extension', () => {
      const result = getAsbFilePath('./button.tsx', '/base')
      expect(result).toBe(path.resolve('/base', './button.tsx'))
    })

    it('should find file with .ts extension', () => {
      vi.spyOn(fs, 'existsSync').mockImplementation((p) => {
        return p === path.resolve('/base', 'button.ts')
      })
      const result = getAsbFilePath('./button', '/base')
      expect(result).toBe(path.resolve('/base', 'button.ts'))
      vi.restoreAllMocks()
    })

    it('should find file with .tsx extension', () => {
      vi.spyOn(fs, 'existsSync').mockImplementation((p) => {
        return p === path.resolve('/base', 'button.tsx')
      })
      const result = getAsbFilePath('./button', '/base')
      expect(result).toBe(path.resolve('/base', 'button.tsx'))
      vi.restoreAllMocks()
    })

    it('should find index file when direct file not found', () => {
      vi.spyOn(fs, 'existsSync').mockImplementation((p) => {
        return p === path.resolve('/base', 'button', 'index.ts')
      })
      const result = getAsbFilePath('./button', '/base')
      expect(result).toBe(path.resolve('/base', 'button', 'index.ts'))
      vi.restoreAllMocks()
    })

    it('should return empty string when file not found', () => {
      vi.spyOn(fs, 'existsSync').mockReturnValue(false)
      const result = getAsbFilePath('./notfound', '/base')
      expect(result).toBe('')
      vi.restoreAllMocks()
    })

    it('should handle nested paths', () => {
      vi.spyOn(fs, 'existsSync').mockImplementation((p) => {
        return p === path.resolve('/base', 'components', 'button.vue')
      })
      const result = getAsbFilePath('./components/button', '/base')
      expect(result).toBe(path.resolve('/base', 'components', 'button.vue'))
      vi.restoreAllMocks()
    })
  })

  describe('isComponentType', () => {
    it('should return true for type with construct signatures', () => {
      const mockType = {
        getConstructSignatures: () => [{}]
      } as unknown as Type
      expect(isComponentType(mockType)).toBe(true)
    })

    it('should return false for type without construct signatures', () => {
      const mockType = {
        getConstructSignatures: () => []
      } as unknown as Type
      expect(isComponentType(mockType)).toBe(false)
    })
  })
})
