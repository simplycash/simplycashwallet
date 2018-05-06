import { Component } from '@angular/core';
import { AlertController, IonicPage, LoadingController, NavController, NavParams } from 'ionic-angular';
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
  private unit: string = this.wallet.getUnits()[0]
  private wif: string
  private wifInfo: { address: string, balance: number, utxos: any[] }
  private address: string
  private balance: number
  private isReady: boolean = false

  constructor(
    public alertCtrl: AlertController,
    private loadingCtrl: LoadingController,
    public navCtrl: NavController,
    public navParams: NavParams,
    private wallet: Wallet
  ) {
  }

  async ionViewDidEnter() {
    let loader = this.loadingCtrl.create({
      content: "loading balance..."
    })
    await loader.present()
    try {
      this.wif = this.navParams.get('wif')
      let info: any = await this.wallet.getInfoFromWIF(this.wif)
      this.wifInfo = info
      this.address = info.address
      this.balance = info.balance
      if (info.balance > 0) {
        this.isReady = true
      }
      await loader.dismiss()
    } catch (err) {
      console.log(err)
      let message: string
      if (err.message == 'not connected') {
        message = 'failed to get address balance'
      } else {
        message = 'failed to load WIF'
      }
      let errorAlert = this.alertCtrl.create({
        enableBackdropDismiss: false,
        title: 'Error',
        message: message,
        buttons: [{
          text: 'ok',
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

  changeUnit() {
    let units = this.wallet.getUnits()
    this.unit = units[(units.indexOf(this.unit)+1)%units.length]
  }

  async sweep() {
    this.isReady = false
    try {
      let signedTx: any = await this.wallet.makeSweepTx(this.wif, this.wifInfo)
      this.navCtrl.push('ConfirmPage', {
        info: Object.assign({
          outputs: [{
            address: this.wallet.convertAddress('legacy', this.wallet.getPreferedAddressFormat(), this.wallet.getCacheReceiveAddress()),
            satoshis: 0
          }]
        }, signedTx)
      })
    } catch (err) {
      console.log(err)
      let message: string
      if (err.message == 'not connected') {
        message = 'not connected to server'
      } else {
        message = 'failed to create transaction'
      }
      this.alertCtrl.create({
        enableBackdropDismiss: false,
        title: 'Error',
        message: message,
        buttons: ['ok']
      }).present()
    }
    this.isReady = true
  }

}
