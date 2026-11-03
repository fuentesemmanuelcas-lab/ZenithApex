import { DEPOTS, QC_CODES } from './options'
import { STAGES } from '../types/zenith'

/**
 * Sheet-column dropdown cache. Mirrors the Apps Script payload shape so the
 * same lookups (`cache.dropdowns.colC` = depot location, `colD` = application
 * stage) resolve identically online and on the local bridge.
 */
export const cache = {
  dropdowns: {
    colC: DEPOTS,
    colD: [...STAGES] as string[],
    colE: QC_CODES,
  },
}
