import { Component } from '@angular/core'
import { IonicPage, NavController, NavParams, Platform, ToastController } from 'ionic-angular'
import { Clipboard } from '@ionic-native/clipboard'
import * as webClipboard from 'clipboard-polyfill'

import { TranslateService } from '@ngx-translate/core'
import { Wallet } from '../../providers/providers'

@IonicPage()
@Component({
  selector: 'page-wif',
  templateUrl: 'wif.html',
})
export class WifPage {
  public wif: string
  public qrCodeURL: string
  public copyToast: any
  public copyToastTimer: number
  constructor(
    public clipboard: Clipboard,
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
    this.wif = this.navParams.get('wif')
    this.wallet.getQR(this.wif).then((url: string) => {
      this.qrCodeURL = url
    })
  }

  copyToClipboard() {
    this.clipboard.copy(this.wif).then(() => {
      if (this.copyToast) {
        window.clearTimeout(this.copyToastTimer)
      } else {
        this.copyToast = this.toastCtrl.create({
          message: this.translate.instant('WIF_COPIED'),
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

}
