import { Component, ViewChild } from '@angular/core'
import { AlertController, IonicPage, NavController, NavParams, Platform, ToastController } from 'ionic-angular'

import { TranslateService } from '@ngx-translate/core'
import { Wallet } from '../../providers/providers'

@IonicPage()
@Component({
  selector: 'page-sign',
  templateUrl: 'sign.html',
})
export class SignPage {
  @ViewChild('myAmount') myAmountEl
  public unsignedTx: any
  public qrCodeURLs: string[]
  public recipients: string[]
  public finished: boolean
  constructor(
    public alertCtrl: AlertController,
    public navCtrl: NavController,
    public navParams: NavParams,
    public platform: Platform,
    public toastCtrl: ToastController,
    public translate: TranslateService,
    public wallet: Wallet
  ) {
    this.finished = false
    this.unsignedTx = this.navParams.get('unsignedTx')
    this.recipients = this.wallet.getRecipientsFromTx(this.unsignedTx)
  }

  ionViewDidLoad() {
    this.myAmountEl.setFixedAmount(this.unsignedTx.satoshis.toString())
  }

  async signPreparedTx() {
    this.finished = true
    try {
      let m: string = await this.wallet.authorize()
      let signed: any = await this.wallet.signPreparedTx(this.unsignedTx, m)
      let urls: string[] = await this.wallet.getQRs(signed.hex, 'signed')
      this.qrCodeURLs = urls
    } catch (err) {
      this.finished = false
      if (err.message === 'cancelled') {
        return
      }
      console.log(err)
      await this.alertCtrl.create({
        enableBackdropDismiss: false,
        title: this.translate.instant('ERROR'),
        message: this.translate.instant('ERR_UNABLE_TO_SIGN'),
        buttons: [this.translate.instant('OK')]
      }).present()
    }
  }

}
