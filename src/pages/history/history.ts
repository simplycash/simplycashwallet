import { Component } from '@angular/core'
import { ActionSheetController, AlertController, IonicPage, NavController, Platform } from 'ionic-angular'
import { InAppBrowser } from '@ionic-native/in-app-browser'
import { LocalNotifications } from '@ionic-native/local-notifications'
import { TranslateService } from '@ngx-translate/core'
import { Wallet } from '../../providers/providers'

@IonicPage()
@Component({
  selector: 'page-history',
  templateUrl: 'history.html'
})
export class HistoryPage {

  public static readonly pageName = 'HistoryPage'
  public currentUnit: string = this.wallet.getPreferredUnit()
  public balance: number
  public txs: { txid: string, date: string, time: string, delta: number, seen: boolean }[] = []
  public dateGroups: { date: string, txs: any[] }[] = []
  public updateCallback: Function
  public cacheHistory: any

  constructor(
    public actionSheetCtrl: ActionSheetController,
    public alertCtrl: AlertController,
    public iab: InAppBrowser,
    public localNotifications: LocalNotifications,
    public navCtrl: NavController,
    public platform: Platform,
    public translate: TranslateService,
    public wallet: Wallet
  ) {
    this.updateCallback = () => {
      this.refresh()
    }
    this.wallet.subscribeUpdate(this.updateCallback)
  }

  ionViewDidLoad() {
    if (this.platform.is('cordova')) {
      this.localNotifications.getAll().then((items: any) => {
        items.forEach((item: any) => {
          try {
            if (JSON.parse(item.data).page !== 'HistoryPage') {
              return
            }
          } catch (err) {
            return
          }
          this.localNotifications.clear(item.id).catch((err: any) => {
            console.log(err)
          })
        })
      }).catch((err: any) => {
        console.log(err)
      })
    }
  }

  ionViewDidLeave() {
    this.wallet.unsubscribeUpdate(this.updateCallback)
    this.wallet.seeTheUnseen()
  }

  doInfinite(ev) {
    this.fetchHistory()
    ev.complete()
  }

  fetchHistory(start?, end?) {
    let lastDG
    if (typeof start === 'undefined') {
      if (this.dateGroups.length === 0) {
        start = 0
      } else {
        lastDG = this.dateGroups[this.dateGroups.length - 1]
        let lastTx = lastDG.txs[lastDG.txs.length - 1]
        start = this.cacheHistory.findIndex(tx => tx.txid === lastTx.txid) + 1
        if (start >= this.cacheHistory.length || start === -1) {
          return
        }
      }
    }
    if (typeof end === 'undefined') {
      end = start + 30
    }
    this.transformTxs(this.cacheHistory.slice(start, end)).forEach((tx) => {
      if (lastDG && lastDG.date === tx.date) {
        lastDG.txs.push(tx)
      } else {
        this.dateGroups.push({
          date: tx.date,
          txs: [tx]
        })
        lastDG = this.dateGroups[this.dateGroups.length - 1]
      }
    })
  }

  refresh() {
    console.log('history refresh')
    this.balance = this.wallet.getCacheBalance()
    this.cacheHistory = this.wallet.getCacheHistory()
    let start = 0
    let end = 30
    if (this.dateGroups.length > 0) {
      let lastDG = this.dateGroups[this.dateGroups.length - 1]
      let lastTx = lastDG.txs[lastDG.txs.length - 1]
      end = this.cacheHistory.findIndex(tx => tx.txid === lastTx.txid) + 1
      this.dateGroups.length = 0
    }
    this.fetchHistory(start, end)
  }

  transformTxs(txs: any[]) {
    return txs.map((tx: any) => {
      if (!tx.friendlyTimestamp) {
        return {
          txid: tx.txid,
          date: 'unknown',
          time: '',
          delta: tx.delta,
          remark: tx.remark || '',
          seen: tx.seen
        }
      }
      let date: Date = new Date(tx.friendlyTimestamp * 1000)
      let dateStr: string = [date.getFullYear(), ('0'+(date.getMonth()+1)).slice(-2), ('0'+date.getDate()).slice(-2)].join('-')
      let timeStr: string = [('0'+date.getHours()).slice(-2), ('0'+date.getMinutes()).slice(-2)].join(':')
      return {
        txid: tx.txid,
        date: dateStr,
        time: timeStr,
        delta: tx.delta,
        remark: tx.remark || '',
        seen: tx.seen
      }
    })
  }

  today() {
    let date: Date = new Date()
    return [date.getFullYear(), ('0'+(date.getMonth()+1)).slice(-2), ('0'+date.getDate()).slice(-2)].join('-')
  }

  async changeUnit() {
    await this.wallet.changePreferredUnit()
    this.currentUnit = this.wallet.getPreferredUnit()
  }

  showTxAction(tx: any) {
    let action = this.actionSheetCtrl.create({
      buttons: [{
          text: this.translate.instant('REMARK'),
          icon: 'create',
          handler: () => {
            action.dismiss().then(() => {
              this.addRemark(tx)
            })
            return false
          }
        }, {
          text: this.translate.instant('BLOCK_EXPLORER'),
          icon: 'globe',
          handler: () => {
            action.dismiss().then(() => {
              this.iab.create('https://whatsonchain.com/tx/' + tx.txid, '_system')
            })
            return false
          }
      }]
    })
    action.present()
  }

  async addRemark(tx: any) {
    try {
      tx.remark = await this.wallet.promptForTxRemark(tx.txid) || ''
    } catch (err) {
      console.log(err)
    }
  }
}
