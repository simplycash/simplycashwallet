import { Pipe, PipeTransform } from '@angular/core'
import { Wallet } from '../../providers/providers'

@Pipe({
  name: 'convertUnitPipe',
})
export class ConvertUnitPipe implements PipeTransform {
  constructor(private wallet: Wallet) {

  }
  transform(amountSAT: string, ...args) {
    let result: string
    if (args[0] === 'SATS') {
      result = amountSAT
    } else {
      result = this.wallet.convertUnit('SATS', args[0], amountSAT)
    }
    return typeof result === 'undefined' ? '' : result
  }
}
