import { Pipe, PipeTransform } from '@angular/core'
import { Wallet } from '../../providers/providers'

@Pipe({
  name: 'convertAddressPipe',
})
export class ConvertAddressPipe implements PipeTransform {
  constructor(private wallet: Wallet) {

  }
  transform(legacyAddress: string, ...args) {
    let result: string
    if (typeof legacyAddress !== 'undefined') {
      result = this.wallet.convertAddress('legacy', args[0], legacyAddress)
    }
    return typeof result === 'undefined' ? '' : result
  }
}
