/**
 * LOCAL HOLIDAYS ENGINE
 * Computes official and regional public holidays based on user location / timezone,
 * and ties them seamlessly to the user's Google Calendar and email identity.
 */

export interface LocalHoliday {
  id: string
  name: string
  date: string // YYYY-MM-DD
  type: 'PUBLIC' | 'REGIONAL' | 'OBSERVANCE'
  description: string
  countryCode: string
  countryName: string
}

export interface RegionConfig {
  code: string
  name: string
  holidays: (year: number) => Omit<LocalHoliday, 'id' | 'countryCode' | 'countryName'>[]
}

// Holiday calculation helpers
const pad = (n: number) => String(n).padStart(2, '0')

// Nth weekday of month (e.g., 3rd Monday in Jan for MLK Day)
function getNthWeekday(year: number, month: number, targetDay: number, n: number): string {
  let count = 0
  const date = new Date(year, month - 1, 1)
  while (date.getMonth() === month - 1) {
    if (date.getDay() === targetDay) {
      count++
      if (count === n) {
        return `${year}-${pad(month)}-${pad(date.getDate())}`
      }
    }
    date.setDate(date.getDate() + 1)
  }
  return `${year}-${pad(month)}-01`
}

// Last weekday of month (e.g., last Monday in May for Memorial Day)
function getLastWeekday(year: number, month: number, targetDay: number): string {
  const date = new Date(year, month, 0)
  while (date.getMonth() === month - 1) {
    if (date.getDay() === targetDay) {
      return `${year}-${pad(month)}-${pad(date.getDate())}`
    }
    date.setDate(date.getDate() - 1)
  }
  return `${year}-${pad(month)}-01`
}

export const REGIONS: Record<string, RegionConfig> = {
  PH: {
    code: 'PH',
    name: 'Philippines',
    holidays: (year: number) => [
      { name: "New Year's Day", date: `${year}-01-01`, type: 'PUBLIC', description: 'Regular Public Holiday' },
      { name: 'Araw ng Kagitingan (Day of Valor)', date: `${year}-04-09`, type: 'PUBLIC', description: 'National Regular Holiday' },
      { name: 'Labor Day', date: `${year}-05-01`, type: 'PUBLIC', description: 'Regular Holiday' },
      { name: 'Independence Day', date: `${year}-06-12`, type: 'PUBLIC', description: 'National Independence Day' },
      { name: 'National Heroes Day', date: getLastWeekday(year, 8, 1), type: 'PUBLIC', description: 'Last Monday of August' },
      { name: "Bonifacio Day", date: `${year}-11-30`, type: 'PUBLIC', description: 'Regular Holiday honoring Andres Bonifacio' },
      { name: 'Christmas Day', date: `${year}-12-25`, type: 'PUBLIC', description: 'National Regular Holiday' },
      { name: 'Rizal Day', date: `${year}-12-30`, type: 'PUBLIC', description: 'Commemorating Dr. Jose Rizal' },
      { name: 'Ninoy Aquino Day', date: `${year}-08-21`, type: 'REGIONAL', description: 'Special Non-Working Holiday' },
      { name: "All Saints' Day", date: `${year}-11-01`, type: 'REGIONAL', description: 'Special Non-Working Day' },
      { name: 'Feast of the Immaculate Conception', date: `${year}-12-08`, type: 'REGIONAL', description: 'Special Non-Working Holiday' },
    ],
  },
  US: {
    code: 'US',
    name: 'United States',
    holidays: (year: number) => [
      { name: "New Year's Day", date: `${year}-01-01`, type: 'PUBLIC', description: 'Federal Holiday' },
      { name: 'Martin Luther King Jr. Day', date: getNthWeekday(year, 1, 1, 3), type: 'PUBLIC', description: '3rd Monday of January' },
      { name: "Presidents' Day / Washington's Birthday", date: getNthWeekday(year, 2, 1, 3), type: 'PUBLIC', description: '3rd Monday of February' },
      { name: 'Memorial Day', date: getLastWeekday(year, 5, 1), type: 'PUBLIC', description: 'Last Monday of May' },
      { name: 'Juneteenth National Independence Day', date: `${year}-06-19`, type: 'PUBLIC', description: 'Federal Holiday' },
      { name: 'Independence Day (4th of July)', date: `${year}-07-04`, type: 'PUBLIC', description: 'National Independence Day' },
      { name: 'Labor Day', date: getNthWeekday(year, 9, 1, 1), type: 'PUBLIC', description: '1st Monday of September' },
      { name: 'Columbus Day / Indigenous Peoples Day', date: getNthWeekday(year, 10, 1, 2), type: 'PUBLIC', description: '2nd Monday of October' },
      { name: 'Veterans Day', date: `${year}-11-11`, type: 'PUBLIC', description: 'Honoring Military Veterans' },
      { name: 'Thanksgiving Day', date: getNthWeekday(year, 11, 4, 4), type: 'PUBLIC', description: '4th Thursday of November' },
      { name: 'Christmas Day', date: `${year}-12-25`, type: 'PUBLIC', description: 'Federal Holiday' },
    ],
  },
  GB: {
    code: 'GB',
    name: 'United Kingdom',
    holidays: (year: number) => [
      { name: "New Year's Day", date: `${year}-01-01`, type: 'PUBLIC', description: 'Bank Holiday' },
      { name: 'Early May Bank Holiday', date: getNthWeekday(year, 5, 1, 1), type: 'PUBLIC', description: 'First Monday in May' },
      { name: 'Spring Bank Holiday', date: getLastWeekday(year, 5, 1), type: 'PUBLIC', description: 'Last Monday in May' },
      { name: 'Summer Bank Holiday', date: getLastWeekday(year, 8, 1), type: 'PUBLIC', description: 'Late Summer Bank Holiday' },
      { name: 'Christmas Day', date: `${year}-12-25`, type: 'PUBLIC', description: 'Bank Holiday' },
      { name: 'Boxing Day', date: `${year}-12-26`, type: 'PUBLIC', description: 'Bank Holiday' },
    ],
  },
  JP: {
    code: 'JP',
    name: 'Japan',
    holidays: (year: number) => [
      { name: "New Year's Day (Gantan)", date: `${year}-01-01`, type: 'PUBLIC', description: 'National Holiday' },
      { name: 'Coming of Age Day', date: getNthWeekday(year, 1, 1, 2), type: 'PUBLIC', description: 'Seijin no Hi' },
      { name: 'National Foundation Day', date: `${year}-02-11`, type: 'PUBLIC', description: 'Kenkoku Kinen no Hi' },
      { name: "Emperor's Birthday", date: `${year}-02-23`, type: 'PUBLIC', description: 'Tennō Tanjōbi' },
      { name: 'Shōwa Day', date: `${year}-04-29`, type: 'PUBLIC', description: 'Golden Week Start' },
      { name: 'Constitution Memorial Day', date: `${year}-05-03`, type: 'PUBLIC', description: 'Kenpō Kinenbi' },
      { name: 'Greenery Day', date: `${year}-05-04`, type: 'PUBLIC', description: 'Midori no Hi' },
      { name: "Children's Day", date: `${year}-05-05`, type: 'PUBLIC', description: 'Kodomo no Hi' },
      { name: 'Marine Day', date: getNthWeekday(year, 7, 1, 3), type: 'PUBLIC', description: 'Umi no Hi' },
      { name: 'Mountain Day', date: `${year}-08-11`, type: 'PUBLIC', description: 'Yama no Hi' },
      { name: 'Respect for the Aged Day', date: getNthWeekday(year, 9, 1, 3), type: 'PUBLIC', description: 'Keirō no Hi' },
      { name: 'Sports Day', date: getNthWeekday(year, 10, 1, 2), type: 'PUBLIC', description: 'Sports no Hi' },
      { name: 'Culture Day', date: `${year}-11-03`, type: 'PUBLIC', description: 'Bunka no Hi' },
      { name: 'Labor Thanksgiving Day', date: `${year}-11-23`, type: 'PUBLIC', description: 'Kinrō Kansha no Hi' },
    ],
  },
}

/**
 * Detects user country based on Intl API timezone or browser locale.
 */
export function detectUserCountry(): string {
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || ''
    if (tz.includes('Manila') || tz.includes('Asia/Manila')) return 'PH'
    if (tz.includes('Tokyo') || tz.includes('Japan')) return 'JP'
    if (tz.includes('London') || tz.includes('Europe/London')) return 'GB'
    if (
      tz.includes('New_York') ||
      tz.includes('Los_Angeles') ||
      tz.includes('Chicago') ||
      tz.includes('Denver') ||
      tz.includes('America/')
    ) {
      return 'US'
    }

    const lang = navigator.language || ''
    if (lang.includes('PH') || lang.includes('fil') || lang.includes('tl')) return 'PH'
    if (lang.includes('GB')) return 'GB'
    if (lang.includes('JP') || lang.includes('ja')) return 'JP'
    if (lang.includes('US') || lang.includes('en')) return 'US'
  } catch {
    // fallback
  }
  return 'US'
}

/**
 * Retrieves public and local holidays for the given country and years.
 */
export function getLocalHolidays(countryCode: string, years: number[] = [2025, 2026, 2027]): LocalHoliday[] {
  const config = REGIONS[countryCode] || REGIONS.US
  const list: LocalHoliday[] = []

  years.forEach((yr) => {
    const raw = config.holidays(yr)
    raw.forEach((h, idx) => {
      list.push({
        id: `HOL-${config.code}-${yr}-${idx + 1}`,
        name: h.name,
        date: h.date,
        type: h.type,
        description: h.description,
        countryCode: config.code,
        countryName: config.name,
      })
    })
  })

  return list.sort((a, b) => a.date.localeCompare(b.date))
}
