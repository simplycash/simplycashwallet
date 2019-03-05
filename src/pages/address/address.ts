import { Component } from '@angular/core'
import { IonicPage, NavController, NavParams, Platform, ToastController } from 'ionic-angular'
import { InAppBrowser } from '@ionic-native/in-app-browser'
import { Clipboard } from '@ionic-native/clipboard'
import * as webClipboard from 'clipboard-polyfill'

import { TranslateService } from '@ngx-translate/core'
import { Wallet } from '../../providers/providers'

@IonicPage()
@Component({
  selector: 'page-address',
  templateUrl: 'address.html',
})
export class AddressPage {
  public address: string
  public path: [number, number]
  public qrCodeURL: string
  public copyToast: any
  public copyToastTimer: number
  constructor(
    public clipboard: Clipboard,
    public iab: InAppBrowser,
    public navCtrl: NavController,
    public navParams: NavParams,
    public platform: Platform,
    public toastCtrl: ToastController,
    public translate: TranslateService,
    public wallet: Wallet
  ) {
    if (!this.platform.is('cordova')) {
      this.clipboard = {
        copy: (text) => {
          return webClipboard.writeText(text)
        },
        paste: () => {
          return Promise.reject(new Error('unsupported'))
        }
      }
    }
    this.address = this.navParams.get('address')
    this.path = this.navParams.get('path')
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
    this.iab.create('https://whatsonchain.com/address/'+this.address, '_system')
  }

  async pushWifPage() {
    let wif: string
    try {
      let m: string = await this.wallet.authorize()
      wif = this.wallet.getWIF(this.path, m)
    } catch (err) {
      if (err.message !== 'cancelled') {
        console.log(err)
      }
      return
    }
    this.navCtrl.push('WifPage', {
      wif: wif
    })
  }

}
