import { Component } from '@angular/core'
import { IonicPage, NavController, NavParams, Platform, ToastController } from 'ionic-angular'
import { Clipboard } from '@ionic-native/clipboard'
import * as webClipboard from 'clipboard-polyfill'

import { TranslateService } from '@ngx-translate/core'
import { Wallet } from '../../providers/providers'

@IonicPage()
@Component({
  selector: 'page-xpub',
  templateUrl: 'xpub.html',
})
export class XpubPage {
  public xpub: string
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
        },
        clear:() =>{
          return Promise.reject(new Error('unsupported'))
        }
      }
    }
    this.refresh()
  }

  refresh() {
    this.xpub = this.wallet.getXpub()
    if (!this.xpub) {
      return
    }
    return this.wallet.getQR(this.xpub).then((url: string) => {
      this.qrCodeURL = url
    }).catch((err: any) => {
      console.log(err)
    })
  }

  copyToClipboard() {
    this.clipboard.copy(this.xpub).then(() => {
      if (this.copyToast) {
        window.clearTimeout(this.copyToastTimer)
      } else {
        this.copyToast = this.toastCtrl.create({
          message: this.translate.instant('XPUB_COPIED'),
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

  async pushXprvPage() {
    let xprv: string
    try {
      let m: string = await this.wallet.authorize()
      xprv = this.wallet.getXprv(m)
    } catch (err) {
      if (err.message !== 'cancelled') {
        console.log(err)
      }
      return
    }
    this.navCtrl.push('XprvPage', {
      xprv: xprv
    })
  }

}
