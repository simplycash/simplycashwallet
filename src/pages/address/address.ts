import { Component } from '@angular/core'
import { IonicPage, NavController, NavParams, ToastController } from 'ionic-angular'
import { InAppBrowser } from '@ionic-native/in-app-browser'
import { Clipboard } from '@ionic-native/clipboard'

import { TranslateService } from '@ngx-translate/core'
import { Wallet } from '../../providers/providers'

@IonicPage()
@Component({
  selector: 'page-address',
  templateUrl: 'address.html',
})
export class AddressPage {
  private address: string
  private qrCodeURL: string
  private copyToast: any
  private copyToastTimer: number
  constructor(
    private clipboard: Clipboard,
    private iab: InAppBrowser,
    public navCtrl: NavController,
    public navParams: NavParams,
    private toastCtrl: ToastController,
    private translate: TranslateService,
    private wallet: Wallet
  ) {
    this.address = this.navParams.get('address')
    this.wallet.getQR(this.wallet.getPaymentRequestURL(this.address)).then((url: string) => {
      this.qrCodeURL = url
    })
  }

  copyToClipboard() {
    this.clipboard.copy(this.address).then(() => {
      if (this.copyToast) {
        window.clearTimeout(this.copyToastTimer)
      } else {
        this.copyToast = this.toastCtrl.create({
          message: this.translate.instant('ADDRESS_COPIED'),
          position: 'bottom',
          dismissOnPageChange: true
        })
        this.copyToast.onWillDismiss(() => {
          window.clearTimeout(this.copyToastTimer)
          this.copyToast = undefined
        })
        this.copyToast.present()
      }
      this.copyToastTimer = window.setTimeout(() => {
        this.copyToast.dismiss()
      }, 1000)
    }).catch((err: any) => {

    })
  }

  viewOnBlockExplorer() {
    let cashAddr: string = this.wallet.convertAddress(undefined, 'cashaddr', this.address)
    this.iab.create('https://blockchair.com/bitcoin-cash/address/'+cashAddr, '_system')
  }

}
