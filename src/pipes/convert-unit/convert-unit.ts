import { Pipe, PipeTransform } from '@angular/core'
import { Wallet } from '../../providers/providers'

@Pipe({
  name: 'convertUnitPipe',
})
export class ConvertUnitPipe implements PipeTransform {
  constructor(public wallet: Wallet) {

  }
  transform(amountSAT: string, ...args) {
    let result: string
    if (args[0] === 'SATS') {
      result = amountSAT
    } else {
      result = this.wallet.convertUnit('SATS', args[0], amountSAT)
    }
    if (typeof result === 'undefined') {
      return ''
    }
    if (args[1] === 'comma') {
      let p = result.split('.')
      p[0] = p[0].split('').reverse().join('').match(/\d{1,3}-?/g).join(',').split('').reverse().join('')
      return p.join('.')
    }
    return result
  }
}
