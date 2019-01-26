import { Component, ViewChild } from '@angular/core';
import { AlertController, IonicPage, LoadingController, NavController, NavParams } from 'ionic-angular';
import { TranslateService } from '@ngx-translate/core';
import { Wallet } from '../../providers/providers'

/**
 * Generated class for the SweepPage page.
 *
 * See https://ionicframework.com/docs/components/#navigation for more info on
 * Ionic pages and navigation.
 */

@IonicPage()
@Component({
  selector: 'page-sweep',
  templateUrl: 'sweep.html',
})
export class SweepPage {
  @ViewChild('myAmount') myAmountEl
  public wif: string
  public wifInfo: { address: string, balance: number, utxos: any[] }
  public address: string
  public balance: number
  public canLeave: boolean = true

  constructor(
    public alertCtrl: AlertController,
    public loadingCtrl: LoadingController,
    public navCtrl: NavController,
    public navParams: NavParams,
    public translate: TranslateService,
    public wallet: Wallet
  ) {
  }

  ionViewCanLeave() {
    return this.canLeave
  }

  async ionViewDidEnter() {
    let loader = this.loadingCtrl.create({
      content: this.translate.instant('LOADING_BALANCE')+'...'
    })
    await loader.present()
    try {
      this.wif = this.navParams.get('wif')
      let info: any = await this.wallet.getInfoFromWIF(this.wif)
      this.wifInfo = info
      this.address = info.address
      this.balance = info.balance
      this.myAmountEl.setFixedAmount(this.balance.toString())
      await loader.dismiss()
    } catch (err) {
      console.log(err)
      let message: string
      if (err.message == 'not connected') {
        message = this.translate.instant('ERR_GET_ADDR_BALANCE_FAILED')
      } else {
        message = this.translate.instant('ERR_LOAD_WIF_FAILED')
      }
      let errorAlert = this.alertCtrl.create({
        enableBackdropDismiss: false,
        title: this.translate.instant('ERROR'),
        message: message,
        buttons: [{
          text: this.translate.instant('OK'),
          handler: () => {
            errorAlert.dismiss().then(() => {
              this.navCtrl.pop()
            })
            return false
          }
        }]
      })
      await loader.dismiss()
      await errorAlert.present()
    }
  }

  async sweep() {
    this.canLeave = false
    await this.signAndBroadcast()
    this.canLeave = true
  }

  async signAndBroadcast() {
    let hex: string
    let loader = this.loadingCtrl.create({
      content: this.translate.instant('SIGNING')+"..."
    })
    await loader.present()
    try {
      let signedTx: any = await this.wallet.makeSweepTx(this.wif, this.wifInfo)
      hex = signedTx.hex
    } catch (err) {
      await loader.dismiss()
      console.log(err)
      let message: string
      if (err.message == 'not connected') {
        message = this.translate.instant('ERR_NOT_CONNECTED')
      } else if (err.message == 'not enough fund') {
        message = this.translate.instant('ERR_NOT_ENOUGH_FUND')
      } else {
        message = this.translate.instant('ERR_CREATE_TX_FAILED')
      }
      await this.alertCtrl.create({
        enableBackdropDismiss: false,
        title: this.translate.instant('ERROR'),
        message: message,
        buttons: ['ok']
      }).present()
      return
    }
    if (await this.wallet.broadcastTx(hex, loader)) {
      this.navCtrl.popToRoot()
    }
  }

}
