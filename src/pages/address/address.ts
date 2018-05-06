import { Component } from '@angular/core'
import { IonicPage, NavController, NavParams } from 'ionic-angular'
import { InAppBrowser } from '@ionic-native/in-app-browser'
import { Clipboard } from '@ionic-native/clipboard'

import { Wallet } from '../../providers/providers'

@IonicPage()
@Component({
  selector: 'page-address',
  templateUrl: 'address.html',
})
export class AddressPage {
  private address: string
  private qrCodeURL: string
  constructor(
    private clipboard: Clipboard,
    private iab: InAppBrowser,
    public navCtrl: NavController,
    public navParams: NavParams,
    private wallet: Wallet
  ) {
    this.address = this.navParams.get('address')
    this.wallet.getQR(this.wallet.getPaymentRequestURL(this.address)).then((url: string) => {
      this.qrCodeURL = url
    })
  }

  copyToClipboard() {
    this.clipboard.copy(this.address)
  }

  viewOnBlockExplorer() {
    let cashAddr: string = this.wallet.convertAddress(undefined, 'cashaddr', this.address)
    this.iab.create('https://blockchair.com/bitcoin-cash/address/'+cashAddr, '_system')
  }

}
