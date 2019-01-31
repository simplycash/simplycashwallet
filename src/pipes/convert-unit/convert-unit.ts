import { Pipe, PipeTransform } from '@angular/core'
import { Wallet } from '../../providers/providers'

@Pipe({
  name: 'convertUnitPipe',
})
export class ConvertUnitPipe implements PipeTransform {
  constructor(public wallet: Wallet) {

  }
  transform(amountSAT: string, ...args) {
    let comma: boolean = args[1] === 'comma'
    let result: string
    if (args[0] === 'SATS' && !comma) {
      result = amountSAT
    } else {
      result = this.wallet.convertUnit('SATS', args[0], amountSAT, comma)
    }
    if (typeof result === 'undefined') {
      return ''
    }
    return result
  }
}
